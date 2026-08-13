import assert from "node:assert/strict";
import test from "node:test";
import book from "../netlify/functions/book.mjs";

const origin = "https://example.netlify.app";

function request(body, requestOrigin = origin) {
  return new Request(`${origin}/api/book`, {
    method: "POST",
    headers: { origin: requestOrigin, "content-type": "application/json" },
    body,
  });
}

test("rejects cross-origin booking submissions", async () => {
  const response = await book(request("{}", "https://evil.example"));
  assert.equal(response.status, 403);
});

test("rejects malformed JSON", async () => {
  const response = await book(request("{"));
  assert.equal(response.status, 400);
});

test("rejects invalid slots", async () => {
  const response = await book(request(JSON.stringify({
    date: "2026-08-20", start: "08:00", name: "Test User", phone: "6912345678",
    rackets: 0, balls: false, partySize: "4", combo: "0",
  })));
  assert.equal(response.status, 400);
});

test("rejects invalid contact details", async () => {
  const response = await book(request(JSON.stringify({
    date: "2026-08-20", start: "09:00", name: "Test User", phone: "12",
    rackets: 0, balls: false, partySize: "4", combo: "0",
  })));
  assert.equal(response.status, 400);
});

test("rejects combos for two-player bookings", async () => {
  const response = await book(request(JSON.stringify({
    date: "2026-08-20", start: "09:00", name: "Test User", phone: "6912345678",
    rackets: 0, balls: false, partySize: "2", combo: "65",
  })));
  assert.equal(response.status, 400);
});
