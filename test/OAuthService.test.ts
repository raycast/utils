import { describe, expect, it } from "vitest";

import { OAuthService } from "../src/oauth/OAuthService";

type MockedClient = { options: { providerId?: string; providerName: string; description?: string } };

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

  // Table tests cover all seven built-in providers so an omitted option always preserves
  // the existing PKCE client metadata and each option can be overridden independently.
  const providers: Array<{
    id: string;
    providerName: string;
    description: string;
    make: (extra?: object) => OAuthService;
  }> = [
    {
      id: "asana",
      providerName: "Asana",
      description: "Connect your Asana account",
      make: (extra = {}) => OAuthService.asana({ scope: "default", ...extra }),
    },
    {
      id: "github",
      providerName: "GitHub",
      description: "Connect your GitHub account",
      make: (extra = {}) => OAuthService.github({ scope: "repo", ...extra }),
    },
    {
      id: "google",
      providerName: "Google",
      description: "Connect your Google account",
      make: (extra = {}) => OAuthService.google({ clientId: "cid", scope: "email", ...extra }),
    },
    {
      id: "jira",
      providerName: "Jira",
      description: "Connect your Jira account",
      make: (extra = {}) => OAuthService.jira({ clientId: "cid", scope: "read:jira-user", ...extra }),
    },
    {
      id: "linear",
      providerName: "Linear",
      description: "Connect your Linear account",
      make: (extra = {}) => OAuthService.linear({ scope: "read write", ...extra }),
    },
    {
      id: "slack",
      providerName: "Slack",
      description: "Connect your Slack account",
      make: (extra = {}) => OAuthService.slack({ scope: "emoji:read", ...extra }),
    },
    {
      id: "zoom",
      providerName: "Zoom",
      description: "Connect your Zoom account",
      make: (extra = {}) => OAuthService.zoom({ clientId: "cid", scope: "meeting:write", ...extra }),
    },
  ];

  it.each(providers)("keeps the default PKCE client metadata for $id", ({ id, providerName, description, make }) => {
    expect(clientOptions(make())).toMatchObject({ providerId: id, providerName, description });
  });

  it.each(providers)("accepts custom PKCE client metadata for $id", ({ id, make }) => {
    expect(
      clientOptions(
        make({
          providerId: `${id}-second-account`,
          providerName: "Work Account",
          description: "Connect the work account",
        }),
      ),
    ).toMatchObject({
      providerId: `${id}-second-account`,
      providerName: "Work Account",
      description: "Connect the work account",
    });
  });

  it.each(providers)(
    "allows independent providerName and description overrides for $id",
    ({ providerName, description, make }) => {
      expect(clientOptions(make({ providerName: "Work Account" }))).toMatchObject({
        providerName: "Work Account",
        description,
      });
      expect(clientOptions(make({ description: "Connect the work account" }))).toMatchObject({
        providerName,
        description: "Connect the work account",
      });
    },
  );

  it.each(providers)("keeps the default providerId for $id and accepts an override", ({ id, make }) => {
    expect(clientOptions(make()).providerId).toBe(id);
    expect(clientOptions(make({ providerId: `${id}-second-account` })).providerId).toBe(`${id}-second-account`);
  });

  it.each(providers)("passes extraParameters through for $id without dropping provider defaults", ({ make }) => {
    const service = make({ extraParameters: { custom_param: "x" } });
    expect(service.extraParameters).toMatchObject({ custom_param: "x" });
  });
});
