import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

export default function AppHome() {
  return (
    <s-page heading="Wandini Checkout Guard">
      <s-section heading="Status">
        <s-paragraph>
          The developer-hosted app shell is ready for authentication and
          installation. The checkout validation Function remains a separate
          Shopify-hosted extension.
        </s-paragraph>
      </s-section>
      <s-section heading="Checkout protection">
        <s-paragraph>
          After deployment and manual activation in Shopify, the Function
          validates configured checkout lines without relying on this web
          process at checkout runtime.
        </s-paragraph>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) =>
  boundary.headers(headersArgs);
