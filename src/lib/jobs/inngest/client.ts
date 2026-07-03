import { Inngest } from "inngest";

export const inngest = new Inngest({
  id: "invoicepilot",
  eventKey: process.env.INNGEST_EVENT_KEY,
});
