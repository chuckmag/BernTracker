import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native'
import type { CompositeScreenProps } from '@react-navigation/native'
import type { StackScreenProps } from '@react-navigation/stack'
import type { MainTabParamList, RootStackParamList } from '../../App'
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs'
import { api, type GymProgram, type Program } from '../lib/api'
import { useGym } from '../context/GymContext'
import { useProgramFilter } from '../context/ProgramFilterContext'
import { useTheme, type ThemeColors } from '../lib/theme'
import ThemedText from '../components/ThemedText'
import ThemedView from '../components/ThemedView'

type Props = CompositeScreenProps<
  StackScreenProps<RootStackParamList, 'BrowsePrograms'>,
  BottomTabScreenProps<MainTabParamList>
>

/**
 * Browse Programs (mobile parity, #507).
 *
 * Mirrors apps/web/src/pages/BrowsePrograms.tsx — two sections:
 *   1. "Public programs" — unaffiliated PUBLIC programs (e.g. the CrossFit
 *      Mainsite WOD program). Open to any authenticated user.
 *   2. "From your gym" — PUBLIC programs in the caller's gym they haven't
 *      joined yet.
 *
 * Both sections subscribe via `POST /programs/:id/subscribe`. On join, the
 * program is pre-selected in the multi-program filter and the user is dropped
 * on the Feed tab so they see the "today" view for the program they just
 * joined — completes the "found something interesting → seeing today's
 * workout" loop in one tap, same as web.
 */
export default function BrowseProgramsScreen({ navigation }: Props) {
  const { activeGym } = useGym()
  const { setSelected: setProgramFilter } = useProgramFilter()
  const { colors } = useTheme()
  const styles = makeStyles(colors)

  const [publicCatalog, setPublicCatalog] = useState<Program[]>([])
  const [gymPrograms, setGymPrograms] = useState<GymProgram[]>([])
  const [loadingCatalog, setLoadingCatalog] = useState(true)
  const [loadingGym, setLoadingGym] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [joiningId, setJoiningId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoadingCatalog(true)
    setError(null)
    api.programs.publicCatalog()
      .then((list) => { if (!cancelled) setPublicCatalog(list) })
      .catch((e: Error) => { if (!cancelled) setError(e.message) })
      .finally(() => { if (!cancelled) setLoadingCatalog(false) })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    const gymId = activeGym?.id
    if (!gymId) {
      setGymPrograms([])
      return
    }
    let cancelled = false
    setLoadingGym(true)
    api.gyms.programs.browse(gymId)
      .then((list) => { if (!cancelled) setGymPrograms(list) })
      .catch((e: Error) => { if (!cancelled) setError(e.message) })
      .finally(() => { if (!cancelled) setLoadingGym(false) })
    return () => { cancelled = true }
  }, [activeGym?.id])

  async function handleJoin(programId: string) {
    setJoiningId(programId)
    setError(null)
    try {
      await api.programs.subscribe(programId)
      setPublicCatalog((prev) => prev.filter((p) => p.id !== programId))
      setGymPrograms((prev) => prev.filter((gp) => gp.programId !== programId))
      setProgramFilter([programId])
      navigation.navigate('Main', { screen: 'FeedTab' })
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setJoiningId(null)
    }
  }

  return (
    <ThemedView variant="screen" style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <ThemedText style={styles.title}>Browse programs</ThemedText>
        <ThemedText variant="tertiary" style={styles.subtitle}>
          Find programs to follow — popular public programs like the CrossFit
          Mainsite WOD, plus public programs from your gym.
        </ThemedText>

        {error && (
          <View style={[styles.errorBox, { backgroundColor: colors.cardBg, borderColor: colors.errorText }]}>
            <ThemedText style={[styles.errorText, { color: colors.errorText }]}>{error}</ThemedText>
          </View>
        )}

        <Section
          title="Public programs"
          subtitle="Open programs anyone can join — no gym affiliation needed."
          loading={loadingCatalog}
          isEmpty={!loadingCatalog && publicCatalog.length === 0}
          emptyTitle="No public programs available"
          emptyBody="Public programs will appear here as they're added."
          colors={colors}
        >
          {publicCatalog.map((program) => (
            <ProgramCard
              key={program.id}
              program={program}
              joining={joiningId === program.id}
              onJoin={handleJoin}
              colors={colors}
            />
          ))}
        </Section>

        <Section
          title="From your gym"
          subtitle={
            activeGym
              ? 'Public programs in your gym that you haven’t joined yet.'
              : 'Set up your gym in Settings to see programs from your gym.'
          }
          loading={Boolean(activeGym) && loadingGym}
          isEmpty={Boolean(activeGym) && !loadingGym && gymPrograms.length === 0}
          emptyTitle="Nothing to browse from your gym"
          emptyBody="Public programs from your gym show up here. Ask a staff member if you're expecting one and don't see it."
          colors={colors}
        >
          {activeGym && gymPrograms.map((gp) => (
            <ProgramCard
              key={gp.program.id}
              program={gp.program}
              isDefault={gp.isDefault}
              joining={joiningId === gp.program.id}
              onJoin={handleJoin}
              colors={colors}
            />
          ))}
        </Section>
      </ScrollView>
    </ThemedView>
  )
}

// ── Section ──────────────────────────────────────────────────────────────────

interface SectionProps {
  title: string
  subtitle: string
  loading: boolean
  isEmpty: boolean
  emptyTitle: string
  emptyBody: string
  colors: ThemeColors
  children: React.ReactNode
}

function Section({ title, subtitle, loading, isEmpty, emptyTitle, emptyBody, colors, children }: SectionProps) {
  const styles = makeStyles(colors)
  return (
    <View style={styles.section}>
      <ThemedText style={styles.sectionTitle}>{title}</ThemedText>
      <ThemedText variant="tertiary" style={styles.sectionSubtitle}>{subtitle}</ThemedText>

      {loading && (
        <View style={styles.loadingRow} testID="section-loading">
          <ActivityIndicator color={colors.primary} />
        </View>
      )}

      {isEmpty && (
        <View style={[styles.emptyState, { borderColor: colors.borderSubtle }]}>
          <ThemedText style={styles.emptyTitle}>{emptyTitle}</ThemedText>
          <ThemedText variant="tertiary" style={styles.emptyBody}>{emptyBody}</ThemedText>
        </View>
      )}

      {!loading && !isEmpty && <View style={styles.cardGrid}>{children}</View>}
    </View>
  )
}

// ── ProgramCard ──────────────────────────────────────────────────────────────

interface ProgramCardProps {
  program: Program
  isDefault?: boolean
  joining: boolean
  onJoin: (programId: string) => void
  colors: ThemeColors
}

function ProgramCard({ program, isDefault, joining, onJoin, colors }: ProgramCardProps) {
  const styles = makeStyles(colors)
  const stripe = program.coverColor ?? colors.borderInteractive
  const memberCount = program._count?.members ?? 0
  return (
    <ThemedView variant="card" style={[styles.card, { borderColor: colors.borderSubtle }]}>
      <View style={[styles.stripe, { backgroundColor: stripe }]} />
      <View style={styles.cardBody}>
        <View style={styles.cardTitleRow}>
          <ThemedText style={styles.cardTitle} numberOfLines={1}>{program.name}</ThemedText>
          {isDefault && (
            <View style={[styles.defaultBadge, { backgroundColor: colors.primary }]}>
              <ThemedText style={[styles.defaultBadgeText, { color: '#ffffff' }]}>Default</ThemedText>
            </View>
          )}
        </View>
        {program.description && (
          <ThemedText variant="tertiary" style={styles.cardDescription} numberOfLines={3}>
            {program.description}
          </ThemedText>
        )}
        <ThemedText variant="tertiary" style={styles.cardMeta}>
          {memberCount} {memberCount === 1 ? 'member' : 'members'}
        </ThemedText>
        <TouchableOpacity
          style={[styles.joinBtn, { backgroundColor: colors.primary }, joining && styles.joinBtnDisabled]}
          onPress={() => onJoin(program.id)}
          disabled={joining}
          accessibilityRole="button"
          accessibilityLabel={`Join ${program.name}`}
          testID={`join-${program.id}`}
        >
          <ThemedText style={[styles.joinBtnText, { color: '#ffffff' }]}>
            {joining ? 'Joining…' : 'Join'}
          </ThemedText>
        </TouchableOpacity>
      </View>
    </ThemedView>
  )
}

// ── Styles ───────────────────────────────────────────────────────────────────

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1 },
    content: { padding: 16, paddingBottom: 32 },
    title: { fontSize: 24, fontWeight: '700', marginBottom: 4 },
    subtitle: { fontSize: 13, marginBottom: 16, lineHeight: 18 },
    errorBox: {
      borderWidth: 1,
      borderRadius: 8,
      padding: 12,
      marginBottom: 16,
    },
    errorText: { fontSize: 13 },
    section: { marginBottom: 24 },
    sectionTitle: { fontSize: 17, fontWeight: '600', marginBottom: 4 },
    sectionSubtitle: { fontSize: 13, marginBottom: 12, lineHeight: 18 },
    loadingRow: { paddingVertical: 24, alignItems: 'center' },
    emptyState: {
      borderWidth: 1,
      borderRadius: 8,
      padding: 16,
      alignItems: 'center',
    },
    emptyTitle: { fontSize: 15, fontWeight: '600', marginBottom: 4, textAlign: 'center' },
    emptyBody: { fontSize: 13, textAlign: 'center', lineHeight: 18 },
    cardGrid: { gap: 12 },
    card: {
      borderRadius: 10,
      borderWidth: 1,
      overflow: 'hidden',
    },
    stripe: { height: 6, width: '100%' },
    cardBody: { padding: 14 },
    cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    cardTitle: { fontSize: 16, fontWeight: '600', flex: 1, minWidth: 0 },
    defaultBadge: {
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 4,
    },
    defaultBadgeText: { fontSize: 11, fontWeight: '600' },
    cardDescription: { fontSize: 13, marginTop: 4, lineHeight: 18 },
    cardMeta: { fontSize: 12, marginTop: 10 },
    joinBtn: {
      marginTop: 12,
      borderRadius: 8,
      paddingVertical: 10,
      alignItems: 'center',
    },
    joinBtnDisabled: { opacity: 0.6 },
    joinBtnText: { fontSize: 14, fontWeight: '600' },
  })
}
