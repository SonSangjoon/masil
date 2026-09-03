import type { Metadata } from "next";
import type { ReactNode } from "react";
import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";

import {
  MASIL_AGENT_BROWSER_CONTROL_FALLBACK,
  MASIL_AGENT_CONTROL_MODE,
  MASIL_AGENT_PRIMARY_INTERFACE,
  MASIL_AGENT_ROUTING_ELEMENT_ID,
  MASIL_AGENT_ROUTING_JSON,
  MASIL_AGENT_TAB_TITLE,
  MASIL_AGENT_WEBMCP_PRIORITY,
} from "@/agent-routing";
import {
  MASIL_WEBMCP_DISCOVERY_CHANNEL,
  MASIL_WEBMCP_DISCOVERY_ELEMENT_ID,
  MASIL_WEBMCP_DISCOVERY_JSON,
  MASIL_WEBMCP_TOOL_SCOPE,
  MASIL_WEBMCP_TRANSPORT,
} from "@/features/webmcp/discovery";

import { PreloadResources } from "./preload-resources";

import "./globals.css";

export const metadata: Metadata = {
  title: MASIL_AGENT_TAB_TITLE,
  description:
    "혼자 사는 어르신이 말로 창작하고 대화하며 도움의 창구를 여는 WebMCP 경험",
  other: {
    "webmcp-provider": "MASIL",
    "webmcp-transport": MASIL_WEBMCP_TRANSPORT,
    "webmcp-tool-scope": MASIL_WEBMCP_TOOL_SCOPE,
    "webmcp-discovery": MASIL_WEBMCP_DISCOVERY_CHANNEL,
    "webmcp-primary-agent-interface": MASIL_AGENT_PRIMARY_INTERFACE,
    "webmcp-agent-control-mode": MASIL_AGENT_CONTROL_MODE,
    "webmcp-priority": MASIL_AGENT_WEBMCP_PRIORITY,
    "webmcp-browser-control-fallback": MASIL_AGENT_BROWSER_CONTROL_FALLBACK,
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full font-sans">
        <script
          id={MASIL_AGENT_ROUTING_ELEMENT_ID}
          type="application/json"
          data-purpose="agent-interaction-routing"
          dangerouslySetInnerHTML={{ __html: MASIL_AGENT_ROUTING_JSON }}
        />
        <script
          id={MASIL_WEBMCP_DISCOVERY_ELEMENT_ID}
          type="application/json"
          data-purpose="webmcp-agent-discovery"
          dangerouslySetInnerHTML={{ __html: MASIL_WEBMCP_DISCOVERY_JSON }}
        />
        <PreloadResources />
        {children}
      </body>
    </html>
  );
}
