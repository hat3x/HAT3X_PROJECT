// ─── Scraping / extraction service ─────────────────────────────────────────
// Responsible for extracting structured data from a business URL:
// - HTML content
// - Metadata (title, description, og:tags)
// - Contact info (emails, phones, social links)
// - Service / product mentions
// - Booking / form signals
//
// Phase 4 will implement real scraping logic.
// Phase 1 stub defines the interface.
import type { BusinessScrape } from "@/types/domain";

export interface ScrapeInput {
  business_id: string;
  url: string;
}

export interface ScrapeResult {
  scrape: BusinessScrape;
}

/**
 * Extracts structured data from a business URL.
 *
 * Future: can use Puppeteer, Playwright, or a dedicated scraping API.
 * Should be called before AI analysis so the analyzer has real data to work with.
 */
export async function scrapeBusinessUrl(_input: ScrapeInput): Promise<ScrapeResult> {
  // TODO Phase 4: implement scraping
  // - fetch HTML content
  // - extract metadata
  // - detect contact info, services, signals
  // - persist to business_scrapes table
  throw new Error("scrapeBusinessUrl: not implemented in Phase 1");
}
