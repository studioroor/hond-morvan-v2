#!/usr/bin/env bun
/**
 * Health Check Script for hondmorvan.nl
 *
 * Checks all main routes and key assets for availability.
 * Can be run locally or via GitHub Actions.
 *
 * Usage:
 *   bun run scripts/health-check.ts
 *   bun run scripts/health-check.ts --verbose
 *   bun run scripts/health-check.ts --json
 */

const SITE_URL = process.env.SITE_URL || "https://hondmorvan.nl";

// All routes to check
const ROUTES = [
	"/",
	"/fotogalerij/",
	"/tarieven/",
	"/kaart/",
	"/gastenboek/",
	"/contact/",
	"/links/",
	// Paginated routes (check first few pages)
	"/gastenboek/2",
];

// Key assets to verify
const ASSETS = ["/favicon.webp", "/styles/global.css", "/sitemap-index.xml"];

interface CheckResult {
	url: string;
	status: number;
	ok: boolean;
	responseTime: number;
	error?: string;
	headers?: Record<string, string>;
}

interface DnsCheck {
	resolvedIps: string[];
	isCloudflareProxy: boolean;
	isGitHubPages: boolean;
	warning?: string;
}

interface HealthReport {
	timestamp: string;
	siteUrl: string;
	totalChecks: number;
	passed: number;
	failed: number;
	results: CheckResult[];
	overallStatus: "healthy" | "degraded" | "down";
	dns?: DnsCheck;
}

// GitHub Pages IP ranges
const GITHUB_PAGES_IPS = [
	"185.199.108.153",
	"185.199.109.153",
	"185.199.110.153",
	"185.199.111.153",
];

// Cloudflare IP ranges (partial - common ones)
const CLOUDFLARE_RANGES = [
	"104.21.",
	"172.67.",
	"104.18.",
	"104.19.",
	"104.20.",
];

async function checkDns(hostname: string): Promise<DnsCheck> {
	try {
		// Use Bun's DNS resolver
		const { resolve4 } = await import("node:dns/promises");
		const ips = await resolve4(hostname);

		const isGitHubPages = ips.some((ip) => GITHUB_PAGES_IPS.includes(ip));
		const isCloudflareProxy = ips.some((ip) =>
			CLOUDFLARE_RANGES.some((range) => ip.startsWith(range)),
		);

		let warning: string | undefined;
		if (isCloudflareProxy && !isGitHubPages) {
			warning =
				"DNS points to Cloudflare proxy, not GitHub Pages. " +
				"This can cause 403 errors. Disable Cloudflare proxy (orange cloud → gray cloud).";
		}

		return {
			resolvedIps: ips,
			isCloudflareProxy,
			isGitHubPages,
			warning,
		};
	} catch (error) {
		return {
			resolvedIps: [],
			isCloudflareProxy: false,
			isGitHubPages: false,
			warning: `DNS lookup failed: ${error instanceof Error ? error.message : String(error)}`,
		};
	}
}

async function checkUrl(url: string, verbose: boolean): Promise<CheckResult> {
	const fullUrl = `${SITE_URL}${url}`;
	const startTime = performance.now();

	try {
		const response = await fetch(fullUrl, {
			method: "GET",
			headers: {
				"User-Agent":
					"HondMorvan-HealthCheck/1.0 (https://github.com/studioroor/hond-morvan-v2)",
				Accept:
					"text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
			},
			redirect: "follow",
		});

		const responseTime = Math.round(performance.now() - startTime);

		const result: CheckResult = {
			url: fullUrl,
			status: response.status,
			ok: response.ok,
			responseTime,
		};

		if (verbose) {
			result.headers = {
				"content-type": response.headers.get("content-type") || "",
				"cache-control": response.headers.get("cache-control") || "",
				server: response.headers.get("server") || "",
				"x-github-request-id":
					response.headers.get("x-github-request-id") || "",
			};
		}

		// Log 403 specifically with more detail
		if (response.status === 403) {
			result.error = `Forbidden - possible rate limiting or access restriction`;
			// Try to get response body for more info
			try {
				const body = await response.text();
				if (body.length < 500) {
					result.error += ` | Body: ${body.substring(0, 200)}`;
				}
			} catch {
				// ignore
			}
		}

		return result;
	} catch (error) {
		const responseTime = Math.round(performance.now() - startTime);
		return {
			url: fullUrl,
			status: 0,
			ok: false,
			responseTime,
			error: error instanceof Error ? error.message : String(error),
		};
	}
}

async function runHealthCheck(verbose: boolean): Promise<HealthReport> {
	const allUrls = [...ROUTES, ...ASSETS];
	const results: CheckResult[] = [];

	console.log(`\n🔍 Health Check for ${SITE_URL}`);

	// DNS check first
	const hostname = new URL(SITE_URL).hostname;
	console.log(`\n📡 DNS Check for ${hostname}...`);
	const dnsCheck = await checkDns(hostname);

	console.log(`   Resolved IPs: ${dnsCheck.resolvedIps.join(", ") || "none"}`);
	if (dnsCheck.isGitHubPages) {
		console.log(`   ✅ Points to GitHub Pages`);
	}
	if (dnsCheck.isCloudflareProxy) {
		console.log(`   ⚠️  Points to Cloudflare proxy (not direct to origin)`);
	}
	if (dnsCheck.warning) {
		console.log(`   🚨 ${dnsCheck.warning}`);
	}

	console.log(`\n   Checking ${allUrls.length} endpoints...\n`);

	// Run checks with some concurrency but not too aggressive
	const batchSize = 3;
	for (let i = 0; i < allUrls.length; i += batchSize) {
		const batch = allUrls.slice(i, i + batchSize);
		const batchResults = await Promise.all(
			batch.map((url) => checkUrl(url, verbose)),
		);
		results.push(...batchResults);

		// Log progress
		for (const result of batchResults) {
			const icon = result.ok ? "✅" : "❌";
			const status = result.status || "ERR";
			const time = `${result.responseTime}ms`;
			console.log(`${icon} [${status}] ${result.url} (${time})`);
			if (result.error && verbose) {
				console.log(`   └─ ${result.error}`);
			}
		}

		// Small delay between batches to avoid rate limiting
		if (i + batchSize < allUrls.length) {
			await new Promise((r) => setTimeout(r, 100));
		}
	}

	const passed = results.filter((r) => r.ok).length;
	const failed = results.filter((r) => !r.ok).length;

	let overallStatus: "healthy" | "degraded" | "down";
	if (failed === 0) {
		overallStatus = "healthy";
	} else if (failed < results.length / 2) {
		overallStatus = "degraded";
	} else {
		overallStatus = "down";
	}

	return {
		timestamp: new Date().toISOString(),
		siteUrl: SITE_URL,
		totalChecks: results.length,
		passed,
		failed,
		results,
		overallStatus,
		dns: dnsCheck,
	};
}

function printSummary(report: HealthReport) {
	console.log("\n" + "=".repeat(50));
	console.log("📊 HEALTH CHECK SUMMARY");
	console.log("=".repeat(50));

	const statusIcon =
		report.overallStatus === "healthy"
			? "🟢"
			: report.overallStatus === "degraded"
				? "🟡"
				: "🔴";

	console.log(`Status: ${statusIcon} ${report.overallStatus.toUpperCase()}`);
	console.log(`Timestamp: ${report.timestamp}`);
	console.log(`Passed: ${report.passed}/${report.totalChecks}`);
	console.log(`Failed: ${report.failed}/${report.totalChecks}`);

	// DNS summary
	if (report.dns) {
		console.log(`\n📡 DNS Configuration:`);
		console.log(`   IPs: ${report.dns.resolvedIps.join(", ") || "none"}`);
		if (report.dns.isGitHubPages) {
			console.log(`   ✅ Correctly points to GitHub Pages`);
		} else if (report.dns.isCloudflareProxy) {
			console.log(
				`   ⚠️  ISSUE: Points to Cloudflare proxy instead of GitHub Pages`,
			);
			console.log(
				`   💡 FIX: Disable Cloudflare proxy (orange → gray cloud) in DNS settings`,
			);
		}
	}

	if (report.failed > 0) {
		console.log("\n❌ Failed checks:");
		for (const result of report.results.filter((r) => !r.ok)) {
			console.log(
				`   - ${result.url} (${result.status}): ${result.error || "Unknown error"}`,
			);
		}
	}

	// Calculate average response time
	const avgTime =
		report.results.reduce((sum, r) => sum + r.responseTime, 0) /
		report.results.length;
	console.log(`\nAvg Response Time: ${Math.round(avgTime)}ms`);

	// Check for slow responses (> 2s)
	const slowResponses = report.results.filter((r) => r.responseTime > 2000);
	if (slowResponses.length > 0) {
		console.log(`\n⚠️  Slow responses (>2s):`);
		for (const result of slowResponses) {
			console.log(`   - ${result.url} (${result.responseTime}ms)`);
		}
	}

	console.log("\n" + "=".repeat(50));
}

// Main execution
const args = process.argv.slice(2);
const verbose = args.includes("--verbose") || args.includes("-v");
const jsonOutput = args.includes("--json");

const report = await runHealthCheck(verbose);

if (jsonOutput) {
	console.log(JSON.stringify(report, null, 2));
} else {
	printSummary(report);
}

// Exit with error code if not healthy
if (report.overallStatus !== "healthy") {
	process.exit(1);
}
