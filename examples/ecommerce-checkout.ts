/**
 * ecommerce-checkout.ts
 * Multi-step e-commerce flow showing regex, boundary, and xpath extractors.
 *
 * Demonstrates:
 *  - Multiple CSV datasets
 *  - All extractor types (json, regex, boundary, xpath)
 *  - All assertion types (status, body_contains, response_time)
 *  - PUT and DELETE methods
 */
import {
  httpSampler,
  csvDataSet,
  registerSampler,
  registerCsv,
  type TestOptions,
} from "../src/index.js";

export const options: TestOptions = {
  vus: 100,
  rampUp: "2m",
  duration: "10m",
};

export const baseUrl = "https://shop.example.com";

// ── Multiple datasets ─────────────────────────────────────────────────────────

const users = csvDataSet("./data/users.csv", {
  variableNames: ["userId", "email", "password"],
});

const products = csvDataSet("./data/products.csv", {
  variableNames: ["productId", "quantity"],
  recycle: true,
});

registerCsv(users);
registerCsv(products);

// ── Scenario ──────────────────────────────────────────────────────────────────

export default function () {
  // 1. Search products — regex extractor on HTML response
  registerSampler(
    httpSampler
      .get("Search Products", "/search?q=${productId}", {
        headers: { Accept: "text/html" },
      })
      .regexExtract("csrfToken", 'name="csrf_token" value="([^"]+)"', 1, "")
      .assertStatus(200)
      .assertBodyContains("Add to Cart")
  );

  // 2. Add to cart — boundary extractor for session ID
  registerSampler(
    httpSampler
      .post("Add to Cart", "/cart/add", {
        body: {
          productId: users.var("productId"),
          quantity: users.var("quantity"),
          csrf: "${csrfToken}",
        },
      })
      .boundaryExtract("cartId", '"cartId":"', '"')
      .assertStatus(201)
      .assertResponseTime(1500)
  );

  // 3. View cart — JSON extractor for total
  registerSampler(
    httpSampler
      .get("View Cart", "/cart/${cartId}", {
        headers: { Authorization: "Bearer ${authToken}" },
      })
      .jsonExtract("orderTotal", "$.total")
      .jsonExtract("itemCount", "$.items.length")
      .assertStatus(200)
  );

  // 4. Checkout — PUT with full payload
  registerSampler(
    httpSampler
      .put("Checkout", "/cart/${cartId}/checkout", {
        body: {
          email: users.var("email"),
          total: "${orderTotal}",
        },
        headers: {
          Authorization: "Bearer ${authToken}",
          "X-CSRF-Token": "${csrfToken}",
        },
        responseTimeout: 10000,
      })
      .jsonExtract("orderId", "$.orderId")
      .assertStatus(200)
      .assertBodyContains("orderId")
      .assertResponseTime(10000)
  );

  // 5. Clear cart — DELETE
  registerSampler(
    httpSampler
      .delete("Clear Cart", "/cart/${cartId}", {
        headers: { Authorization: "Bearer ${authToken}" },
      })
      .assertStatus(204)
  );
}
