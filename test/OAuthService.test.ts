import { describe, expect, it } from "vitest";

import { OAuthService } from "../src/oauth/OAuthService";

type MockedClient = { options: { providerId?: string; providerName?: string } };

function clientOptions(service: OAuthService) {
  return (service.client as unknown as MockedClient).options;
}

describe("OAuthService built-in providers", () => {
  it("keeps the default providerId and extraParameters when the new options are omitted", () => {
    const service = OAuthService.linear({ scope: "read write" });
    expect(clientOptions(service).providerId).toBe("linear");
    expect(service.extraParameters).toEqual({ actor: "user" });
  });

  it("threads a custom providerId into the internally-constructed PKCEClient", () => {
    const service = OAuthService.linear({ scope: "read write", providerId: "linear-ws-org1-user1" });
    expect(clientOptions(service).providerId).toBe("linear-ws-org1-user1");
  });

  it("merges caller extraParameters over the provider defaults (Linear)", () => {
    const service = OAuthService.linear({ scope: "read write", extraParameters: { prompt: "consent" } });
    expect(service.extraParameters).toEqual({ actor: "user", prompt: "consent" });
  });

  it("lets a caller-supplied key override a provider default (caller wins)", () => {
    const service = OAuthService.linear({ scope: "read write", extraParameters: { actor: "application" } });
    expect(service.extraParameters).toEqual({ actor: "application" });
  });

  it("merges caller extraParameters over the Slack user_scope default", () => {
    const service = OAuthService.slack({ scope: "emoji:read", extraParameters: { team: "T123" } });
    expect(service.extraParameters).toEqual({ user_scope: "emoji:read", team: "T123" });
  });

  it("passes providerId and extraParameters through on providers without defaults (Jira)", () => {
    const service = OAuthService.jira({
      clientId: "custom-client-id",
      scope: "read:jira-user",
      providerId: "jira-site-b",
      extraParameters: { audience: "api.atlassian.com" },
    });
    expect(clientOptions(service).providerId).toBe("jira-site-b");
    expect(service.extraParameters).toEqual({ audience: "api.atlassian.com" });
  });

  // Table test: the change touches all seven providers — each must keep its default
  // providerId when the option is omitted and accept an override when given.
  const providers: Array<{ name: string; make: (extra?: object) => OAuthService }> = [
    { name: "asana", make: (extra = {}) => OAuthService.asana({ scope: "default", ...extra }) },
    { name: "github", make: (extra = {}) => OAuthService.github({ scope: "repo", ...extra }) },
    { name: "google", make: (extra = {}) => OAuthService.google({ clientId: "cid", scope: "email", ...extra }) },
    { name: "jira", make: (extra = {}) => OAuthService.jira({ clientId: "cid", scope: "read:jira-user", ...extra }) },
    { name: "linear", make: (extra = {}) => OAuthService.linear({ scope: "read write", ...extra }) },
    { name: "slack", make: (extra = {}) => OAuthService.slack({ scope: "emoji:read", ...extra }) },
    { name: "zoom", make: (extra = {}) => OAuthService.zoom({ clientId: "cid", scope: "meeting:write", ...extra }) },
  ];

  it.each(providers)("keeps the default providerId for $name and accepts an override", ({ name, make }) => {
    expect(clientOptions(make()).providerId).toBe(name);
    expect(clientOptions(make({ providerId: `${name}-second-account` })).providerId).toBe(`${name}-second-account`);
  });

  it.each(providers)("passes extraParameters through for $name without dropping provider defaults", ({ make }) => {
    const service = make({ extraParameters: { custom_param: "x" } });
    expect(service.extraParameters).toMatchObject({ custom_param: "x" });
  });
});
