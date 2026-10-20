import { formatDigestText, type SellerDigest } from './digest.js';

export interface Notifier {
  readonly channel: string;
  send(digest: SellerDigest): Promise<void>;
}

export class LogNotifier implements Notifier {
  readonly channel = 'log';
  constructor(private readonly log: (message: string) => void = console.log) {}

  async send(digest: SellerDigest): Promise<void> {
    this.log(`\n${formatDigestText(digest)}\n`);
  }
}

// Slack, Teams, n8n...
export class WebhookNotifier implements Notifier {
  readonly channel = 'webhook';
  constructor(
    private readonly url: string,
    private readonly timeoutMs = 5000,
  ) {}

  async send(digest: SellerDigest): Promise<void> {
    const response = await fetch(this.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: formatDigestText(digest), digest }),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!response.ok) {
      throw new Error(`Webhook respondeu ${response.status}`);
    }
  }
}

export function createNotifier(webhookUrl?: string): Notifier {
  return webhookUrl ? new WebhookNotifier(webhookUrl) : new LogNotifier();
}
