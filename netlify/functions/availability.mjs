import { firebaseRequest } from "./_firebase.mjs";
import { json } from "./_http.mjs";

const MONTH_RE = /^20\d{2}-(0[1-9]|1[0-2])$/;
const SLOT_RE = /^(09|10|12|13|15|16|18|19|21|22|00)(00|30)$/;

export default async function availability(request) {
  if (request.method !== "GET") return json({ error: "Method not allowed" }, 405);

  const month = new URL(request.url).searchParams.get("month") || "";
  if (!MONTH_RE.test(month)) return json({ error: "Invalid month" }, 400);

  try {
    const response = await firebaseRequest("bookings", {
      query: {
        orderBy: JSON.stringify("$key"),
        startAt: JSON.stringify(`${month}-01`),
        endAt: JSON.stringify(`${month}-31`),
      },
    });
    if (!response.ok) throw new Error(`Firebase read failed (${response.status})`);

    const slots = [];
    const data = (await response.json()) || {};
    for (const [date, day] of Object.entries(data)) {
      if (!day || typeof day !== "object") continue;
      for (const time of Object.keys(day)) {
        if (SLOT_RE.test(time)) slots.push(`${date}|${time.slice(0, 2)}:${time.slice(2)}`);
      }
    }

    return json({ slots });
  } catch (error) {
    console.error("Availability lookup failed", error);
    return json({ error: "Availability is temporarily unavailable" }, 503);
  }
}
