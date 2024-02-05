import { Color, OAuth } from "@raycast/api";
import { OAuthService } from "./OAuthService";
import { OnAuthorizeParams } from "./withAccessToken";

type ClientOptions = {
  clientId: string;
  authorizeUrl: string;
  tokenUrl: string;
};

type BaseProviderOptions = {
  scope: string;
  personalAccessToken?: string;
  refreshTokenUrl?: string;
  onAuthorize?: (params: OnAuthorizeParams) => void;
};

export type ProviderWithDefaultClientOptions = BaseProviderOptions & Partial<ClientOptions>;

export type ProviderOptions = BaseProviderOptions & ClientOptions;

const PROVIDERS_CONFIG = {
  asana: {
    clientId: "1191201745684312",
    icon: `<svg xmlns="http://www.w3.org/2000/svg" width="251" height="232" fill="none"><path fill="#F06A6A" d="M179.383 54.373c0 30.017-24.337 54.374-54.354 54.374-30.035 0-54.373-24.338-54.373-54.374C70.656 24.338 94.993 0 125.029 0c30.017 0 54.354 24.338 54.354 54.373ZM54.393 122.33C24.376 122.33.02 146.668.02 176.685c0 30.017 24.337 54.373 54.373 54.373 30.035 0 54.373-24.338 54.373-54.373 0-30.017-24.338-54.355-54.373-54.355Zm141.253 0c-30.035 0-54.373 24.338-54.373 54.374 0 30.035 24.338 54.373 54.373 54.373 30.017 0 54.374-24.338 54.374-54.373 0-30.036-24.338-54.374-54.374-54.374Z"/></svg>`,
  },
  github: {
    clientId: "7235fe8d42157f1f38c0",
    icon: `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 16 16"><path fill-rule="evenodd" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z"/></svg>`,
  },
  google: {
    icon: `<svg xmlns="http://www.w3.org/2000/svg" style="display:block" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/><path fill="none" d="M0 0h48v48H0z"/></svg>`,
  },
  jira: {
    icon: `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="2361" height="2500" viewBox="2.59 0 214.091 224"><linearGradient id="a" x1="102.4" x2="56.15" y1="218.63" y2="172.39" gradientTransform="matrix(1 0 0 -1 0 264)" gradientUnits="userSpaceOnUse"><stop offset=".18" stop-color="#0052cc"/><stop offset="1" stop-color="#2684ff"/></linearGradient><linearGradient xlink:href="#a" id="b" x1="114.65" x2="160.81" y1="85.77" y2="131.92"/><path fill="#2684ff" d="M214.06 105.73 117.67 9.34 108.33 0 35.77 72.56 2.59 105.73a8.89 8.89 0 0 0 0 12.54l66.29 66.29L108.33 224l72.55-72.56 1.13-1.12 32.05-32a8.87 8.87 0 0 0 0-12.59zm-105.73 39.39L75.21 112l33.12-33.12L141.44 112z"/><path fill="url(#a)" d="M108.33 78.88a55.75 55.75 0 0 1-.24-78.61L35.62 72.71l39.44 39.44z"/><path fill="url(#b)" d="m141.53 111.91-33.2 33.21a55.77 55.77 0 0 1 0 78.86L181 151.35z"/></svg>`,
  },
  linear: {
    clientId: "c8ff37b9225c3c9aefd7d66ea0e5b6f1",
    icon: `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" fill="none" viewBox="0 0 1024 1024"><path fill="url(#a)" d="M0 0h1024v1024H0z"/><g filter="url(#b)"><path fill="url(#c)" d="M262.274 570.997c-1.139-4.857 4.646-7.915 8.174-4.388l186.943 186.943c3.527 3.528.469 9.313-4.388 8.174-94.339-22.131-168.598-96.39-190.729-190.729Z"/><path fill="url(#d)" d="M256.01 496.072a5.064 5.064 0 0 0 1.482 3.894l266.542 266.542a5.064 5.064 0 0 0 3.894 1.482 256.33 256.33 0 0 0 35.647-4.74c3.914-.804 5.274-5.613 2.449-8.439L269.189 457.976c-2.826-2.825-7.635-1.465-8.439 2.449a256.33 256.33 0 0 0-4.74 35.647Z"/><path fill="url(#e)" d="M277.56 408.092a5.058 5.058 0 0 0 1.063 5.631l331.654 331.654a5.058 5.058 0 0 0 5.631 1.063 255.297 255.297 0 0 0 26.55-13.742c2.827-1.68 3.263-5.564.938-7.889L299.191 380.604c-2.325-2.325-6.209-1.889-7.889.938a255.297 255.297 0 0 0-13.742 26.55Z"/><path fill="url(#f)" d="M320.813 348.539c-1.895-1.895-2.013-4.935-.227-6.933C367.511 289.072 435.77 256 511.754 256 653.275 256 768 370.725 768 512.246c0 75.984-33.072 144.243-85.606 191.168-1.998 1.786-5.038 1.668-6.933-.227L320.813 348.539Z"/></g><defs><linearGradient id="a" x1="512" x2="512" y1="0" y2="1024" gradientUnits="userSpaceOnUse"><stop stop-color="#5C6BF1"/><stop offset="1" stop-color="#283188"/></linearGradient><linearGradient id="c" x1="274.286" x2="541.257" y1="303.543" y2="694.857" gradientUnits="userSpaceOnUse"><stop stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity=".65"/></linearGradient><linearGradient id="d" x1="274.286" x2="541.257" y1="303.543" y2="694.857" gradientUnits="userSpaceOnUse"><stop stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity=".65"/></linearGradient><linearGradient id="e" x1="274.286" x2="541.257" y1="303.543" y2="694.857" gradientUnits="userSpaceOnUse"><stop stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity=".65"/></linearGradient><linearGradient id="f" x1="274.286" x2="541.257" y1="303.543" y2="694.857" gradientUnits="userSpaceOnUse"><stop stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity=".65"/></linearGradient><filter id="b" width="797.149" height="797.149" x="113.426" y="135.703" color-interpolation-filters="sRGB" filterUnits="userSpaceOnUse"><feFlood flood-opacity="0" result="BackgroundImageFix"/><feColorMatrix in="SourceAlpha" result="hardAlpha" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"/><feOffset dy="22.277"/><feGaussianBlur stdDeviation="71.287"/><feColorMatrix values="0 0 0 0 0.118924 0 0 0 0 0.158031 0 0 0 0 0.570833 0 0 0 0.7 0"/><feBlend in2="BackgroundImageFix" result="effect1_dropShadow_9417_5600"/><feColorMatrix in="SourceAlpha" result="hardAlpha" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"/><feOffset dy="7.797"/><feGaussianBlur stdDeviation="30"/><feColorMatrix values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.17 0"/><feBlend in2="effect1_dropShadow_9417_5600" result="effect2_dropShadow_9417_5600"/><feBlend in="SourceGraphic" in2="effect2_dropShadow_9417_5600" result="shape"/></filter></defs></svg>`,
  },
  slack: {
    clientId: "851756884692.5546927290212",
    icon: `<svg xmlns="http://www.w3.org/2000/svg" xml:space="preserve" id="Layer_1" x="0" y="0" style="enable-background:new 0 0 270 270" version="1.1" viewBox="0 0 270 270"><style>.st0{fill:#e01e5a}.st1{fill:#36c5f0}.st2{fill:#2eb67d}.st3{fill:#ecb22e}</style><path d="M99.4 151.2c0 7.1-5.8 12.9-12.9 12.9-7.1 0-12.9-5.8-12.9-12.9 0-7.1 5.8-12.9 12.9-12.9h12.9v12.9zM105.9 151.2c0-7.1 5.8-12.9 12.9-12.9s12.9 5.8 12.9 12.9v32.3c0 7.1-5.8 12.9-12.9 12.9s-12.9-5.8-12.9-12.9v-32.3z" class="st0"/><path d="M118.8 99.4c-7.1 0-12.9-5.8-12.9-12.9 0-7.1 5.8-12.9 12.9-12.9s12.9 5.8 12.9 12.9v12.9h-12.9zM118.8 105.9c7.1 0 12.9 5.8 12.9 12.9s-5.8 12.9-12.9 12.9H86.5c-7.1 0-12.9-5.8-12.9-12.9s5.8-12.9 12.9-12.9h32.3z" class="st1"/><path d="M170.6 118.8c0-7.1 5.8-12.9 12.9-12.9 7.1 0 12.9 5.8 12.9 12.9s-5.8 12.9-12.9 12.9h-12.9v-12.9zM164.1 118.8c0 7.1-5.8 12.9-12.9 12.9-7.1 0-12.9-5.8-12.9-12.9V86.5c0-7.1 5.8-12.9 12.9-12.9 7.1 0 12.9 5.8 12.9 12.9v32.3z" class="st2"/><path d="M151.2 170.6c7.1 0 12.9 5.8 12.9 12.9 0 7.1-5.8 12.9-12.9 12.9-7.1 0-12.9-5.8-12.9-12.9v-12.9h12.9zM151.2 164.1c-7.1 0-12.9-5.8-12.9-12.9 0-7.1 5.8-12.9 12.9-12.9h32.3c7.1 0 12.9 5.8 12.9 12.9 0 7.1-5.8 12.9-12.9 12.9h-32.3z" class="st3"/></svg>`,
  },
  zoom: {
    icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 351.845 80"><path d="M73.786 78.835H10.88A10.842 10.842 0 0 1 .833 72.122a10.841 10.841 0 0 1 2.357-11.85L46.764 16.7h-31.23C6.954 16.699 0 9.744 0 1.165h58.014c4.414 0 8.357 2.634 10.046 6.712a10.843 10.843 0 0 1-2.356 11.85L22.13 63.302h36.122c8.58 0 15.534 6.955 15.534 15.534Zm278.059-48.544C351.845 13.588 338.256 0 321.553 0c-8.934 0-16.975 3.89-22.524 10.063C293.48 3.89 285.44 0 276.505 0c-16.703 0-30.291 13.588-30.291 30.291v48.544c8.579 0 15.534-6.955 15.534-15.534v-33.01c0-8.137 6.62-14.757 14.757-14.757s14.757 6.62 14.757 14.757v33.01c0 8.58 6.955 15.534 15.534 15.534V30.291c0-8.137 6.62-14.757 14.757-14.757s14.758 6.62 14.758 14.757v33.01c0 8.58 6.954 15.534 15.534 15.534V30.291ZM238.447 40c0 22.091-17.909 40-40 40s-40-17.909-40-40 17.908-40 40-40 40 17.909 40 40Zm-15.534 0c0-13.512-10.954-24.466-24.466-24.466S173.98 26.488 173.98 40s10.953 24.466 24.466 24.466S222.913 53.512 222.913 40Zm-70.68 0c0 22.091-17.909 40-40 40s-40-17.909-40-40 17.909-40 40-40 40 17.909 40 40Zm-15.534 0c0-13.512-10.954-24.466-24.466-24.466S87.767 26.488 87.767 40s10.954 24.466 24.466 24.466S136.699 53.512 136.699 40Z" style="fill:#0b5cff"/></svg>`,
  },
};

const getIcon = (markup: string) => `data:image/svg+xml,${markup}`;

export const asanaService = (options: ProviderWithDefaultClientOptions) =>
  new OAuthService({
    client: new OAuth.PKCEClient({
      redirectMethod: OAuth.RedirectMethod.Web,
      providerName: "Asana",
      providerIcon: getIcon(PROVIDERS_CONFIG.asana.icon),
      providerId: "asana",
      description: "Connect your Asana account",
    }),
    clientId: options.clientId ?? PROVIDERS_CONFIG.asana.clientId,
    authorizeUrl: options.authorizeUrl ?? "https://asana.oauth.raycast.com/authorize",
    tokenUrl: options.tokenUrl ?? "https://asana.oauth.raycast.com/token",
    refreshTokenUrl: options.refreshTokenUrl,
    scope: options.scope,
    personalAccessToken: options.personalAccessToken,
    onAuthorize: options.onAuthorize,
  });

export const githubService = (options: ProviderWithDefaultClientOptions) =>
  new OAuthService({
    client: new OAuth.PKCEClient({
      redirectMethod: OAuth.RedirectMethod.Web,
      providerName: "GitHub",
      providerIcon: { source: getIcon(PROVIDERS_CONFIG.github.icon), tintColor: Color.PrimaryText },
      providerId: "github",
      description: "Connect your GitHub account",
    }),
    clientId: options.clientId ?? PROVIDERS_CONFIG.github.clientId,
    authorizeUrl: options.authorizeUrl ?? "https://github.oauth.raycast.com/authorize",
    tokenUrl: options.tokenUrl ?? "https://github.oauth.raycast.com/token",
    refreshTokenUrl: options.refreshTokenUrl,
    scope: options.scope,
    personalAccessToken: options.personalAccessToken,
    onAuthorize: options.onAuthorize,
  });

export const googleService = (options: ProviderOptions) =>
  new OAuthService({
    client: new OAuth.PKCEClient({
      redirectMethod: OAuth.RedirectMethod.AppURI,
      providerName: "Google",
      providerIcon: getIcon(PROVIDERS_CONFIG.google.icon),
      providerId: "google",
      description: "Connect your Google account",
    }),
    clientId: options.clientId,
    authorizeUrl: options.authorizeUrl,
    tokenUrl: options.tokenUrl,
    refreshTokenUrl: options.tokenUrl,
    scope: options.scope,
    personalAccessToken: options.personalAccessToken,
    bodyEncoding: "url-encoded",
    onAuthorize: options.onAuthorize,
  });

export const jiraService = (options: ProviderOptions) =>
  new OAuthService({
    client: new OAuth.PKCEClient({
      redirectMethod: OAuth.RedirectMethod.Web,
      providerName: "Jira",
      providerIcon: getIcon(PROVIDERS_CONFIG.jira.icon),
      providerId: "jira",
      description: "Connect your Jira account",
    }),
    clientId: options.clientId,
    authorizeUrl: options.authorizeUrl,
    tokenUrl: options.tokenUrl,
    refreshTokenUrl: options.refreshTokenUrl,
    scope: options.scope,
    personalAccessToken: options.personalAccessToken,
    onAuthorize: options.onAuthorize,
  });

export const linearService = (options: ProviderWithDefaultClientOptions) =>
  new OAuthService({
    client: new OAuth.PKCEClient({
      redirectMethod: OAuth.RedirectMethod.Web,
      providerName: "Linear",
      providerIcon: getIcon(PROVIDERS_CONFIG.linear.icon),
      providerId: "linear",
      description: "Connect your Linear account",
    }),
    clientId: options.clientId ?? PROVIDERS_CONFIG.linear.clientId,
    authorizeUrl: options.authorizeUrl ?? "https://linear.oauth.raycast.com/authorize",
    tokenUrl: options.tokenUrl ?? "https://linear.oauth.raycast.com/token",
    scope: options.scope,
    extraParameters: {
      actor: "user",
    },
    onAuthorize: options.onAuthorize,
  });

export const slackService = (options: ProviderWithDefaultClientOptions) =>
  new OAuthService({
    client: new OAuth.PKCEClient({
      redirectMethod: OAuth.RedirectMethod.Web,
      providerName: "Slack",
      providerIcon: getIcon(PROVIDERS_CONFIG.slack.icon),
      providerId: "slack",
      description: "Connect your Slack account",
    }),
    clientId: options.clientId ?? PROVIDERS_CONFIG.slack.clientId,
    authorizeUrl: options.authorizeUrl ?? "https://slack.oauth.raycast.com/authorize",
    tokenUrl: options.tokenUrl ?? "https://slack.oauth.raycast.com/token",
    scope: "",
    extraParameters: {
      user_scope: options.scope,
    },
    personalAccessToken: options.personalAccessToken,
    bodyEncoding: "url-encoded",
    onAuthorize: options.onAuthorize,
  });

export const zoomService = (options: ProviderOptions) =>
  new OAuthService({
    client: new OAuth.PKCEClient({
      redirectMethod: OAuth.RedirectMethod.Web,
      providerName: "Zoom",
      providerIcon: getIcon(PROVIDERS_CONFIG.zoom.icon),
      providerId: "zoom",
      description: "Connect your Zoom account",
    }),
    clientId: options.clientId,
    authorizeUrl: options.authorizeUrl,
    tokenUrl: options.tokenUrl,
    refreshTokenUrl: options.refreshTokenUrl,
    scope: options.scope,
    personalAccessToken: options.personalAccessToken,
    bodyEncoding: "url-encoded",
    onAuthorize: options.onAuthorize,
  });
