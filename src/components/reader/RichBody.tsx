import { Linking, useWindowDimensions } from "react-native";
import RenderHTML from "react-native-render-html";
import { useTheme, Body } from "@/ui";
import { sanitizeRichText } from "@/lib/sanitizeHtml";

/** Native text layout only. No WebView, remote embeds or inline CSS execution. */
export function RichBody({
  html,
  baseUrl = process.env.EXPO_PUBLIC_SITE_URL || "https://presspaper.ai",
}: {
  html: string;
  baseUrl?: string;
}) {
  const { width } = useWindowDimensions();
  const { colors } = useTheme();
  if (!/<[a-z][\s\S]*>/i.test(html)) return <Body>{html}</Body>;
  return (
    <RenderHTML
      contentWidth={Math.max(200, width - 72)}
      source={{ html: sanitizeRichText(html) }}
      baseStyle={{ color: colors.text, fontSize: 16, lineHeight: 26 }}
      enableCSSInlineProcessing={false}
      ignoredDomTags={[
        "script",
        "style",
        "iframe",
        "object",
        "embed",
        "img",
        "video",
        "audio",
        "svg",
        "math",
        "form",
        "input",
        "button",
        "template",
        "link",
        "meta",
        "base",
      ]}
      renderersProps={{
        a: {
          onPress: (_event, href) => {
            try {
              if (/[\u0000-\u0020\\]/.test(href) || href.startsWith("//"))
                return;
              const url = new URL(href, baseUrl);
              if (
                ["https:", "http:", "mailto:"].includes(url.protocol) &&
                !url.username &&
                !url.password
              )
                void Linking.openURL(url.href).catch(() => {});
            } catch {
              /* Invalid links remain inert. */
            }
          },
        },
      }}
    />
  );
}
