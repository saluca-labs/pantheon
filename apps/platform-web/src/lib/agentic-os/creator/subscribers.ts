/**
 * Creator OS Phase 2 — Subscriber domain types.
 *
 * Email subscriber management for the Creator's newsletter audience.
 * Each subscriber is uniquely identified by (user_id, email).
 *
 * Status taxonomy:
 *   active       — receiving email
 *   unsubscribed — opted out
 *   bounced      — email hard-bounced
 *
 * @license MIT — Tiresias Creator OS Phase 2 (internal).
 */

export const SUBSCRIBER_STATUSES = [
  'active',
  'unsubscribed',
  'bounced',
] as const;

export type SubscriberStatus = (typeof SUBSCRIBER_STATUSES)[number];

export interface CreatorSubscriber {
  id: string;
  userId: string;
  email: string;
  name: string | null;
  status: SubscriberStatus;
  source: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AddSubscriberInput {
  email: string;
  name?: string;
  source?: string;
}

export interface ListSubscribersOpts {
  status?: SubscriberStatus;
  search?: string;
  limit?: number;
  offset?: number;
}
