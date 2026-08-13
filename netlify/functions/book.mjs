import { firebaseRequest } from "./_firebase.mjs";
import { json, sameOrigin } from "./_http.mjs";

const VALID_SLOTS = new Set([
  "09:00", "10:30", "12:00", "13:30", "15:00", "16:30",
  "18:00", "19:30", "21:00", "22:30", "00:00",
]);
const TWO_PLAYER_SLOTS = new Set([
  "09:00", "10:30", "12:00", "13:30", "15:00", "16:30", "18:00", "19:30",
]);
const COMBO_PRICES = new Map([["0", 0], ["65", 65], ["70", 70], ["75", 75]]);
const COMBO_LABELS = new Map([
  ["0", "Χωρίς combo"],
  ["65", "Combo 2"],
  ["70", "Combo 1"],
  ["75", "Combo 3"],
]);

function cleanText(value, maxLength) {
  return typeof value === "string" ? value.trim().replace(/[\u0000-\u001F\u007F]/g, " ").slice(0, maxLength) : "";
}

function validDate(value) {
  if (!/^20\d{2}-(0[1-9]|1[0-2])-([012]\d|3[01])$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

function calculateTotal({ partySize, balls, rackets, combo }) {
  if (partySize === "2") return (balls ? 19 : 15) * 2;
  const comboPrice = COMBO_PRICES.get(combo);
  return comboPrice > 0 ? comboPrice + (balls ? 8 : 0) : 44 + rackets * 2 + (balls ? 8 : 0);
}

async function sendNotifications(booking) {
  if (process.env.NOTIFICATIONS_ENABLED !== "true") return { sent: false, reason: "disabled" };

  const recipients = JSON.parse(process.env.CALLMEBOT_RECIPIENTS_JSON || "[]");
  const message = [
    "*Νέα κράτηση North Padel*",
    `Ημερομηνία: ${booking.date}`,
    `Ώρα: ${booking.start}`,
    `Όνομα: ${booking.name}`,
    `Τηλέφωνο: ${booking.phone}`,
    `Τύπος: ${booking.partySize} άτομα`,
    `Ρακέτες: ${booking.partySize === "2" ? "Δωρεάν" : booking.rackets}`,
    `Premium Padel Balls: ${booking.balls ? "Ναι" : "Όχι"}`,
    `Combo: ${COMBO_LABELS.get(booking.combo)}`,
    `Σύνολο: ${booking.total}`,
  ].join("\n");

  const calls = recipients.map(({ phone, apikey }) => {
    const url = new URL("https://api.callmebot.com/whatsapp.php");
    url.searchParams.set("phone", phone);
    url.searchParams.set("apikey", apikey);
    url.searchParams.set("text", message);
    return fetch(url, { signal: AbortSignal.timeout(8000) });
  });

  const appsScriptUrl = process.env.APPS_SCRIPT_URL;
  if (appsScriptUrl) {
    const url = new URL(appsScriptUrl);
    for (const [key, value] of Object.entries(booking)) url.searchParams.set(key, String(value));
    calls.push(fetch(url, { signal: AbortSignal.timeout(8000) }));
  }

  const results = await Promise.allSettled(calls);
  const failed = results.filter((result) => result.status === "rejected" || !result.value.ok).length;
  return { sent: calls.length > 0, failed };
}

export default async function book(request) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!sameOrigin(request)) return json({ error: "Forbidden origin" }, 403);

  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 8_192) return json({ error: "Request too large" }, 413);

  let input;
  try {
    input = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const date = cleanText(input.date, 10);
  const start = cleanText(input.start, 5);
  const name = cleanText(input.name, 80);
  const phone = cleanText(input.phone, 24);
  const digits = phone.replace(/\D/g, "");
  const partySize = String(input.partySize || "4");
  const combo = String(input.combo || "0");
  const rackets = Number(input.rackets);
  const balls = input.balls === true;

  if (!validDate(date) || !VALID_SLOTS.has(start)) return json({ error: "Invalid slot" }, 400);
  if (name.length < 2 || digits.length < 8 || digits.length > 15) return json({ error: "Invalid contact details" }, 400);
  if (!Number.isInteger(rackets) || rackets < 0 || rackets > 4) return json({ error: "Invalid rackets value" }, 400);
  if (!new Set(["2", "4"]).has(partySize)) return json({ error: "Invalid party size" }, 400);
  if (!COMBO_PRICES.has(combo)) return json({ error: "Invalid combo" }, 400);
  if (partySize === "2" && (!TWO_PLAYER_SLOTS.has(start) || combo !== "0")) return json({ error: "Invalid 2-player booking" }, 400);

  const total = `€${calculateTotal({ partySize, balls, rackets, combo })}`;
  const booking = { date, start, name, phone, rackets, balls, combo, partySize, total, createdAt: Date.now() };
  const timeKey = start.replace(":", "");

  try {
    const path = `bookings/${date}/${timeKey}`;
    const current = await firebaseRequest(path, { headers: { "X-Firebase-ETag": "true" } });
    if (!current.ok) throw new Error(`Firebase read failed (${current.status})`);
    if ((await current.json()) !== null) return json({ error: "Slot already booked", code: "SLOT_TAKEN" }, 409);

    const etag = current.headers.get("etag");
    if (!etag) throw new Error("Firebase did not return an ETag");
    const write = await firebaseRequest(path, {
      method: "PUT",
      headers: { "content-type": "application/json", "if-match": etag },
      body: JSON.stringify(booking),
    });
    if (write.status === 412) return json({ error: "Slot already booked", code: "SLOT_TAKEN" }, 409);
    if (!write.ok) throw new Error(`Firebase write failed (${write.status})`);

    let notifications = { sent: false, reason: "failed" };
    try {
      notifications = await sendNotifications(booking);
    } catch (error) {
      console.error("Booking notification failed", error);
    }

    return json({ ok: true, total, notifications }, 201);
  } catch (error) {
    console.error("Booking creation failed", error);
    return json({ error: "Booking could not be saved" }, 503);
  }
}
