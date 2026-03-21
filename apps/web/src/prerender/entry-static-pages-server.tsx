import type { ComponentType } from "react";
import { renderToString } from "react-dom/server";
import { StaticRouter } from "react-router-dom/server";

import { LandingPage } from "../pages/LandingPage";
import { PrivacyPage } from "../pages/PrivacyPage";
import { TermsPage } from "../pages/TermsPage";

const routeComponents: Record<string, ComponentType> = {
  "/": LandingPage,
  "/privacy": PrivacyPage,
  "/terms": TermsPage
};

export function renderRoute(routePath: string): string {
  const Page = routeComponents[routePath] ?? LandingPage;

  return renderToString(
    <StaticRouter location={routePath}>
      <Page />
    </StaticRouter>
  );
}
