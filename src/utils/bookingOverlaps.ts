// Shared overlap detection for bookings, used by the availability calendar
// (build-time warning) and by the CMS (warning before saving a booking).

export interface BookingRange {
	/** Stable identifier, e.g. the content file path or slug. */
	id: string;
	guestName?: string;
	/** YYYY-MM-DD */
	startDate: string;
	/** YYYY-MM-DD */
	endDate: string;
	status?: string;
}

/** Normalize a Date or date-ish string to a YYYY-MM-DD day key (UTC). */
export const toIsoDay = (value: Date | string): string =>
	value instanceof Date
		? value.toISOString().slice(0, 10)
		: String(value).trim().slice(0, 10);

/**
 * Two bookings overlap when they share at least one night. Arriving on the
 * day another booking departs (a changeover) is not an overlap.
 */
export const rangesOverlap = (a: BookingRange, b: BookingRange): boolean =>
	a.startDate < b.endDate && b.startDate < a.endDate;

/** All bookings in `others` that overlap `booking` (excluding itself). */
export const findOverlapsWith = (
	booking: BookingRange,
	others: BookingRange[],
): BookingRange[] =>
	others.filter(
		(other) => other.id !== booking.id && rangesOverlap(booking, other),
	);

/** Every overlapping pair within a list of bookings. */
export const findOverlappingPairs = (
	bookings: BookingRange[],
): [BookingRange, BookingRange][] => {
	const sorted = [...bookings].sort((a, b) =>
		a.startDate.localeCompare(b.startDate),
	);
	const pairs: [BookingRange, BookingRange][] = [];
	for (let i = 0; i < sorted.length; i++) {
		for (let j = i + 1; j < sorted.length; j++) {
			// Sorted by start: once a later booking starts after this one ends,
			// no further booking can overlap it.
			if (sorted[j].startDate >= sorted[i].endDate) break;
			pairs.push([sorted[i], sorted[j]]);
		}
	}
	return pairs;
};

/** Format YYYY-MM-DD as DD-MM-YYYY for Dutch-facing messages. */
export const formatDutchDate = (isoDay: string): string => {
	const [y, m, d] = isoDay.split("-");
	return `${d}-${m}-${y}`;
};

export const describeBooking = (booking: BookingRange): string =>
	`${booking.guestName || "(geen naam)"}: ${formatDutchDate(
		booking.startDate,
	)} t/m ${formatDutchDate(booking.endDate)}`;

/** Read the booking fields from a markdown file's YAML frontmatter. */
export const parseBookingMarkdown = (
	id: string,
	markdown: string,
): BookingRange | null => {
	const frontmatter = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1];
	if (!frontmatter) return null;
	const field = (name: string) =>
		frontmatter
			.match(new RegExp(`^${name}:\\s*(.*)$`, "m"))?.[1]
			?.trim()
			.replace(/^["']|["']$/g, "");
	const startDate = field("startDate");
	const endDate = field("endDate");
	if (!startDate || !endDate) return null;
	return {
		id,
		guestName: field("guestName"),
		startDate: toIsoDay(startDate),
		endDate: toIsoDay(endDate),
		status: field("status"),
	};
};
