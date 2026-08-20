import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, shop } = await authenticate.webhook(request);
  if (session) {
    await db.session.deleteMany({ where: { shop } });
  }
  return new Response();
};
