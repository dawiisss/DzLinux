const { randomUUID } = require("node:crypto");

class WatchlistAutoJoin {
  constructor(now = Date.now) {
    this.now = now;
    this.offer = null;
    this.connection = null;
    this.suspended = false;
  }

  select(events) {
    this.expire();
    if (this.offer || this.connection || this.suspended) return null;
    const event = events.filter((item) => item.autoJoin)
      .sort((a, b) => a.priority - b.priority || a.watchId.localeCompare(b.watchId))[0];
    if (!event) return null;
    this.offer = { ...event, offerId: randomUUID(), createdAt: this.now(), expiresAt: this.now() + 30000, owner: null, deadline: null };
    return this.offer;
  }

  expire() {
    if (this.offer && this.now() > this.offer.expiresAt) this.offer = null;
  }

  claim(eventId, owner) {
    this.expire();
    const offer = this.offer;
    if (!offer || offer.eventId !== eventId || (offer.owner !== null && offer.owner !== owner)) throw new Error("This auto-join alert is no longer available");
    if (offer.owner === null) {
      offer.owner = owner;
      offer.deadline = this.now() + 5000;
    }
    return { ...offer };
  }

  cancel(offerId, owner) {
    if (this.offer?.offerId === offerId && (this.offer.owner === null || this.offer.owner === owner)) this.offer = null;
  }

  begin(owner, offerId = null) {
    if (offerId) {
      if (!this.offer || this.offer.offerId !== offerId || this.offer.owner !== owner || this.connection || this.suspended) throw new Error("Auto-join is no longer available");
    }
    const previous = this.connection;
    const offer = offerId ? this.offer : null;
    this.offer = null;
    this.connection = { id: randomUUID(), owner, watchId: offer?.watchId ?? null, configRevision: offer?.configRevision ?? null, automatic: Boolean(offerId) };
    return { connection: { ...this.connection }, previous };
  }

  finish(id, owner, launched = false) {
    if (this.connection?.id !== id || this.connection.owner !== owner) return;
    if (launched) this.suspended = true;
    this.connection = null;
  }
}

module.exports = { WatchlistAutoJoin };
