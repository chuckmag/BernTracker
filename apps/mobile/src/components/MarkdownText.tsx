import { useMemo } from 'react'
import { Linking, StyleSheet, View, type TextStyle, type ViewStyle } from 'react-native'
import Markdown from 'react-native-markdown-display'
import { useTheme, type ThemeColors } from '../lib/theme'

type Variant = 'secondary' | 'tertiary'

interface MarkdownTextProps {
  source: string | null | undefined
  variant?: Variant
  testID?: string
}

// Tables are left unstyled — phone width can't carry a real table; the
// library's default render is good enough.
export default function MarkdownText({ source, variant = 'secondary', testID }: MarkdownTextProps) {
  const { colors } = useTheme()
  const styles = useMemo(() => buildStyles(colors, variant), [colors, variant])

  if (!source || !source.trim()) return null

  const markdown = (
    <Markdown
      style={styles}
      onLinkPress={(url) => {
        Linking.openURL(url).catch((err) => console.warn('MarkdownText: failed to open URL', url, err))
        return true
      }}
    >
      {source}
    </Markdown>
  )

  return testID ? <View testID={testID}>{markdown}</View> : markdown
}

function buildStyles(colors: ThemeColors, variant: Variant): Record<string, TextStyle | ViewStyle> {
  const base = variant === 'tertiary' ? colors.textTertiary : colors.textSecondary
  const fontSize = variant === 'tertiary' ? 13 : 15
  const lineHeight = variant === 'tertiary' ? 18 : 22
  const codeBlock: TextStyle = {
    backgroundColor: colors.surfaceSubtle,
    color: colors.textPrimary,
    borderWidth: 0,
    padding: 8,
    borderRadius: 6,
    fontFamily: 'monospace',
    fontSize: 13,
    marginVertical: 4,
  }
  return StyleSheet.create({
    body: {
      color: base,
      fontSize,
      lineHeight,
      ...(variant === 'tertiary' ? { fontStyle: 'italic' as const } : undefined),
    },
    paragraph: { marginTop: 0, marginBottom: 8 },
    heading1: { color: colors.textPrimary, fontSize: 18, fontWeight: '600', marginTop: 4, marginBottom: 4 },
    heading2: { color: colors.textPrimary, fontSize: 16, fontWeight: '600', marginTop: 4, marginBottom: 4 },
    heading3: { color: colors.textPrimary, fontSize: 15, fontWeight: '600', marginTop: 4, marginBottom: 4 },
    heading4: { color: colors.textPrimary, fontSize: 14, fontWeight: '600', marginTop: 4, marginBottom: 4 },
    heading5: { color: colors.textPrimary, fontSize: 13, fontWeight: '600', marginTop: 4, marginBottom: 4 },
    heading6: { color: colors.textPrimary, fontSize: 13, fontWeight: '600', marginTop: 4, marginBottom: 4 },
    strong: { color: colors.textPrimary, fontWeight: '600' },
    em: { fontStyle: 'italic' },
    s: { textDecorationLine: 'line-through' },
    link: { color: colors.primary, textDecorationLine: 'underline' },
    blockquote: {
      backgroundColor: 'transparent',
      borderLeftColor: colors.borderInteractive,
      borderLeftWidth: 3,
      paddingLeft: 10,
      marginLeft: 0,
      marginVertical: 4,
    },
    bullet_list: { marginTop: 0, marginBottom: 8 },
    ordered_list: { marginTop: 0, marginBottom: 8 },
    list_item: { flexDirection: 'row', marginBottom: 2 },
    bullet_list_icon: { color: base, marginRight: 6, marginLeft: 0, lineHeight },
    ordered_list_icon: { color: base, marginRight: 6, marginLeft: 0, lineHeight },
    code_inline: {
      backgroundColor: colors.surfaceSubtle,
      color: colors.textPrimary,
      borderWidth: 0,
      paddingHorizontal: 4,
      paddingVertical: 1,
      borderRadius: 4,
      fontFamily: 'monospace',
      fontSize: 13,
    },
    code_block: codeBlock,
    fence: codeBlock,
    hr: { backgroundColor: colors.borderSubtle, height: 1, marginVertical: 8 },
  })
}
