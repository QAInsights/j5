import {
  httpSampler,
  registerSampler,
  type TestOptions,
} from "../src/index.js";

export const options: TestOptions = {
  vus: 2,
  duration: "10s",
};

export const baseUrl = "https://example.com";

export default function () {
  registerSampler(
    httpSampler
      .get("Homepage", "/")
      .assertStatus(200)
  );
}
