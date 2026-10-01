import { describe, expect, it } from "vitest";
import {
  hostControlIdPermitido,
  maiorNsrDoAfd,
  normalizarHostControlId,
  urlControlId,
} from "./controlid-rep";

describe("controlid-rep", () => {
  it("só permite hosts privados", () => {
    expect(hostControlIdPermitido("192.168.0.129")).toBe(true);
    expect(hostControlIdPermitido("https://10.0.0.5/")).toBe(true);
    expect(hostControlIdPermitido("172.16.1.1")).toBe(true);
    expect(hostControlIdPermitido("localhost")).toBe(true);
    expect(hostControlIdPermitido("8.8.8.8")).toBe(false);
    expect(hostControlIdPermitido("evil.com")).toBe(false);
  });

  it("monta URL HTTPS com session e mode", () => {
    expect(normalizarHostControlId("https://192.168.0.129/")).toBe("192.168.0.129");
    expect(urlControlId("192.168.0.129", "/get_afd.fcgi", { session: "abc", mode: "671" })).toBe(
      "https://192.168.0.129/get_afd.fcgi?session=abc&mode=671"
    );
  });

  it("extrai maior NSR do AFD", () => {
    const texto = ["0000000023xxxx", "0000000103yyyy", "0000000073zzzz"].join("\n");
    expect(maiorNsrDoAfd(texto)).toBe(10);
  });
});
