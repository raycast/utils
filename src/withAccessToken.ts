/* eslint-disable react-hooks/rules-of-hooks */
import React, { useMemo, useState } from "react";
import { Detail, environment, MenuBarExtra } from "@raycast/api";

let token: string | null = null;

export function withAccessToken(options: {
  authorize: () => Promise<string>;
}): <T>(component: React.ComponentType<T>) => React.FunctionComponent<T>;
export function withAccessToken(options: {
  authorize: () => Promise<string>;
}): (fn: (() => Promise<void>) | (() => void)) => () => Promise<void>;
export function withAccessToken(options: { authorize: () => Promise<string> }) {
  if (environment.commandMode === "no-view") {
    return (fn: (() => Promise<void>) | (() => void)) => {
      if (!token) {
        return options.authorize().then(() => fn);
      }
      return fn;
    };
  }

  return <T>(Component: React.ComponentType<T>) => {
    const WrappedComponent: React.FunctionComponent<T> = (props) => {
      const [, forceRerender] = useState(0);

      // we use a `useMemo` instead of `useEffect` to avoid a render
      useMemo(() => {
        (async function () {
          token = await options.authorize();

          forceRerender((x) => x + 1);
        })();
      }, []);

      if (!token) {
        if (environment.commandMode === "view") {
          // Using the <List /> component makes the placeholder buggy
          return React.createElement(Detail, { isLoading: true });
        } else if (environment.commandMode === "menu-bar") {
          return React.createElement(MenuBarExtra, { isLoading: true });
        } else {
          throw new Error("Unknown command mode");
        }
      }

      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore too complicated for TS
      return React.createElement(Component, props);
    };

    WrappedComponent.displayName = `withAccessToken(${
      "displayName" in Component ? Component.displayName : Component.name
    })`;

    return WrappedComponent;
  };
}

export function getAccessToken(): string {
  if (!token) {
    throw new Error("getAccessToken must be used when authenticated (eg. used inside `withAccessToken`)");
  }

  return token;
}
