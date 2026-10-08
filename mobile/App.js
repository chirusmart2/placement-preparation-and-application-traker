import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Modal, Platform,
  Pressable, RefreshControl, SafeAreaView, ScrollView, StatusBar, StyleSheet,
  Text, TextInput, View
} from 'react-native';

const API_URL = (process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000').replace(/\/$/, '');
const COLORS = { green: '#1d694d', ink: '#202a24', muted: '#858d87', line: '#ecefea', canvas: '#f5f6f3', white: '#fff', pale: '#edf6f0' };
const TABS = ['Home', 'Applications', 'Practice', 'Skills'];
const QUESTIONS = [
  'Tell me about a project you’re proud of.',
  'How would you find and fix a performance bottleneck in a web app?',
  'Tell me about a time you got feedback that changed your approach.'
];

async function request(path, options = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'The server could not complete that request.');
  return data;
}

function Badge({ status }) {
  const background = status === 'Interview' ? '#f1effa' : status === 'Offer' ? '#eaf5ed' : status === 'In review' ? '#fbf4e8' : '#edf4f5';
  const color = status === 'Interview' ? '#6b61a0' : status === 'Offer' ? '#3d8159' : status === 'In review' ? '#a37237' : '#587988';
  return <Text style={[styles.badge, { backgroundColor: background, color }]}>{status}</Text>;
}

export default function App() {
  const [tab, setTab] = useState('Home');
  const [token, setToken] = useState('');
  const [authMode, setAuthMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [applications, setApplications] = useState([]);
  const [recommendation, setRecommendation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [company, setCompany] = useState('');
  const [role, setRole] = useState('');
  const [deadline, setDeadline] = useState('');
  const [status, setStatus] = useState('Applied');
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answer, setAnswer] = useState('');
  const [showHint, setShowHint] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (quiet = false) => {
    if (!token) { setLoading(false); return; }
    if (!quiet) setLoading(true);
    setError('');
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const [items, skills] = await Promise.all([
        request('/api/applications', { headers }),
        request('/api/recommendations', { headers })
      ]);
      setApplications(items);
      setRecommendation(skills);
    } catch (err) {
      setError(`${err.message} API: ${API_URL}`);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const saveApplication = async () => {
    try {
      await request('/api/applications', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify({ company, role, status, deadline }) });
      setCompany(''); setRole(''); setDeadline(''); setStatus('Applied'); setModalOpen(false);
      await load(true);
    } catch (err) { Alert.alert('Could not save', err.message); }
  };

  const removeApplication = (item) => Alert.alert('Remove application?', `${item.company} will be removed from your tracker.`, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Remove', style: 'destructive', onPress: async () => {
      try { await request(`/api/applications/${item.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }); await load(true); }
      catch (err) { Alert.alert('Could not remove', err.message); }
    } }
  ]);

  const startPractice = () => { setQuestionIndex(0); setAnswer(''); setShowHint(false); setTab('Practice'); };
  const submitAuth = async () => {
    setAuthBusy(true); setError('');
    try {
      const response = await request(`/api/auth/${authMode === 'register' ? 'register' : 'login'}`, {
        method: 'POST', body: JSON.stringify({ email: email.trim(), password })
      });
      setToken(response.token);
      setPassword('');
    } catch (err) { setError(err.message); }
    finally { setAuthBusy(false); }
  };
  const nextQuestion = () => {
    if (questionIndex === QUESTIONS.length - 1) {
      setQuestionIndex(0); setAnswer(''); setShowHint(false);
      Alert.alert('Practice complete', 'Nice work showing up for your preparation.');
      return;
    }
    setQuestionIndex((value) => value + 1); setAnswer(''); setShowHint(false);
  };

  const renderApplication = ({ item }) => (
    <View style={styles.applicationCard}>
      <View style={styles.companyMark}><Text style={styles.companyInitial}>{item.company.trim().charAt(0).toUpperCase()}</Text></View>
      <View style={styles.applicationInfo}>
        <Text style={styles.companyName}>{item.company}</Text>
        <Text style={styles.roleName}>{item.role}</Text>
        <View style={styles.applicationMeta}><Badge status={item.status} /><Text style={styles.deadline}>Due {new Date(`${item.deadline}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</Text></View>
      </View>
      <Pressable accessibilityLabel={`Remove ${item.company}`} onPress={() => removeApplication(item)} style={styles.deleteButton}><Text style={styles.deleteText}>···</Text></Pressable>
    </View>
  );

  const content = () => {
    if (!token) return <ScrollView contentContainerStyle={styles.pageContent} keyboardShouldPersistTaps="handled">
      <Text style={styles.kicker}>YOUR PLACEMENT JOURNEY</Text><Text style={styles.title}>{authMode === 'register' ? 'Create your account' : 'Welcome back'}</Text><Text style={styles.subtitle}>Sign in to keep your applications private and in sync.</Text>
      <View style={styles.featureCard}><Text style={styles.inputLabel}>EMAIL ADDRESS</Text><TextInput value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" placeholder="you@example.com" style={styles.input} /><Text style={styles.inputLabel}>PASSWORD · AT LEAST 10 CHARACTERS</Text><TextInput value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoComplete={authMode === 'register' ? 'new-password' : 'current-password'} placeholder="Enter your password" style={styles.input} />{error ? <Text style={styles.authError}>{error}</Text> : null}<Pressable disabled={authBusy || !email.trim() || password.length < (authMode === 'register' ? 10 : 1)} style={[styles.button, { marginTop: 17 }, (authBusy || !email.trim() || password.length < (authMode === 'register' ? 10 : 1)) && styles.buttonDisabled]} onPress={submitAuth}><Text style={styles.buttonText}>{authBusy ? 'Please wait…' : authMode === 'register' ? 'Create account →' : 'Sign in →'}</Text></Pressable><Pressable style={{ marginTop: 16, alignItems: 'center' }} onPress={() => { setAuthMode(authMode === 'login' ? 'register' : 'login'); setError(''); }}><Text style={styles.inlineLink}>{authMode === 'login' ? 'New to Pathway? Create an account' : 'Already have an account? Sign in'}</Text></Pressable><Text style={styles.authFootnote}>Your applications are only visible to your account.</Text></View>
    </ScrollView>;
    if (loading) return <View style={styles.center}><ActivityIndicator color={COLORS.green} /><Text style={styles.muted}>Loading your placement dashboard…</Text></View>;
    if (error) return <View style={styles.errorCard}><Text style={styles.errorTitle}>Can’t reach your tracker</Text><Text style={styles.errorText}>{error}</Text><Pressable style={styles.button} onPress={() => load()}><Text style={styles.buttonText}>Try again</Text></Pressable></View>;

    if (tab === 'Applications') return <>
      <View style={styles.sectionHeading}><View><Text style={styles.title}>Applications</Text><Text style={styles.subtitle}>Every opportunity, all in one place.</Text></View><Pressable style={styles.smallAdd} onPress={() => setModalOpen(true)}><Text style={styles.smallAddText}>＋ Add</Text></Pressable></View>
      <FlatList data={applications} keyExtractor={(item) => String(item.id)} renderItem={renderApplication} contentContainerStyle={styles.listContent} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} tintColor={COLORS.green} />} ListEmptyComponent={<Text style={styles.emptyText}>No applications yet. Add your first opportunity.</Text>} />
    </>;

    if (tab === 'Practice') return <ScrollView contentContainerStyle={styles.pageContent}>
      <View style={styles.sectionHeading}><View><Text style={styles.kicker}>PRACTICE MAKES PROGRESS</Text><Text style={styles.title}>Interview practice</Text><Text style={styles.subtitle}>Product & engineering · Question {questionIndex + 1} of {QUESTIONS.length}</Text></View><Text style={styles.ornament}>✳</Text></View>
      <View style={styles.featureCard}><Text style={styles.cardLabel}>YOUR QUESTION</Text><Text style={styles.question}>{QUESTIONS[questionIndex]}</Text><Text style={styles.hintIntro}>Try the STAR method: Situation, Task, Action, Result.</Text><TextInput multiline textAlignVertical="top" value={answer} onChangeText={setAnswer} placeholder="Jot down your thoughts…" placeholderTextColor="#9aa19b" style={styles.answerInput} /><Pressable onPress={() => setShowHint(!showHint)}><Text style={styles.inlineLink}>{showHint ? 'Hide hint' : 'Need a hint?'}</Text></Pressable>{showHint && <Text style={styles.hint}>Focus on the impact you made and what you learned. Use specific details to bring your story to life.</Text>}<Pressable style={[styles.button, { marginTop: 18 }]} onPress={nextQuestion}><Text style={styles.buttonText}>{questionIndex === QUESTIONS.length - 1 ? 'Finish session ✓' : 'Next question →'}</Text></Pressable></View>
    </ScrollView>;

    if (tab === 'Skills') return <ScrollView contentContainerStyle={styles.pageContent}>
      <Text style={styles.kicker}>YOUR NEXT BEST STEP</Text><Text style={styles.title}>Skill roadmap</Text><Text style={styles.subtitle}>Build the skills employers are looking for.</Text>
      <View style={styles.featureCard}><View style={styles.skillHeading}><View style={styles.skillMark}><Text style={styles.skillMarkText}>JS</Text></View><View style={{ flex: 1 }}><Text style={styles.cardTitle}>{recommendation?.title || 'Data structures & algorithms'}</Text><Text style={styles.roleName}>Relevant to {recommendation?.matched_roles ?? 0} of your target roles</Text></View><Text style={styles.match}>+{recommendation?.match_boost ?? 0}%</Text></View><View style={styles.meter}><View style={styles.meterFill} /></View><Text style={styles.hintIntro}>Suggested next · {recommendation?.topics ?? 3} topics</Text><View style={styles.topic}><Text style={styles.topicNumber}>01</Text><Text style={styles.topicTitle}>Arrays, strings & hash maps</Text><Text style={styles.topicTime}>25 min</Text></View><View style={styles.topic}><Text style={styles.topicNumber}>02</Text><Text style={styles.topicTitle}>Trees and graph traversal</Text><Text style={styles.topicTime}>35 min</Text></View><View style={styles.topic}><Text style={styles.topicNumber}>03</Text><Text style={styles.topicTitle}>Practice common patterns</Text><Text style={styles.topicTime}>30 min</Text></View></View>
    </ScrollView>;

    const active = applications.filter((item) => item.status !== 'Offer').length;
    const interviews = applications.filter((item) => item.status === 'Interview').length;
    const upcoming = [...applications].sort((a, b) => a.deadline.localeCompare(b.deadline)).slice(0, 3);
    return <ScrollView contentContainerStyle={styles.pageContent} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} tintColor={COLORS.green} />}>
      <Text style={styles.kicker}>YOUR PLACEMENT JOURNEY</Text><Text style={styles.title}>Good morning, Alex ✋</Text><Text style={styles.subtitle}>You’re making great progress. Let’s make today count.</Text>
      <View style={styles.statsRow}><View style={styles.statCard}><Text style={styles.statLabel}>ACTIVE APPLICATIONS</Text><Text style={styles.statValue}>{String(active).padStart(2, '0')}</Text></View><View style={styles.statCard}><Text style={styles.statLabel}>INTERVIEWS</Text><Text style={styles.statValue}>{String(interviews).padStart(2, '0')}</Text></View></View>
      <View style={styles.sectionHeading}><View><Text style={styles.sectionTitle}>Coming up</Text><Text style={styles.subtitle}>A little preparation goes a long way.</Text></View><Pressable onPress={() => setTab('Applications')}><Text style={styles.inlineLink}>All →</Text></Pressable></View>
      {upcoming.map((item) => <View key={item.id} style={styles.upcomingRow}><View style={styles.dateBox}><Text style={styles.dateDay}>{new Date(`${item.deadline}T12:00:00`).getDate()}</Text><Text style={styles.dateMonth}>{new Date(`${item.deadline}T12:00:00`).toLocaleDateString('en-US', { month: 'short' }).toUpperCase()}</Text></View><View style={{ flex: 1 }}><Text style={styles.companyName}>{item.company} · {item.status === 'Interview' ? 'interview' : 'deadline'}</Text><Text style={styles.roleName}>{item.role}</Text></View><Badge status={item.status} /></View>)}
      <View style={styles.sectionHeading}><View><Text style={styles.sectionTitle}>Your next best step</Text><Text style={styles.subtitle}>{recommendation?.title || 'Skill roadmap'}</Text></View></View>
      <View style={styles.recommendCard}><View style={styles.skillMark}><Text style={styles.skillMarkText}>JS</Text></View><View style={{ flex: 1 }}><Text style={styles.cardTitle}>Skill roadmap</Text><Text style={styles.roleName}>+{recommendation?.match_boost ?? 0}% role match</Text></View><Pressable onPress={() => setTab('Skills')}><Text style={styles.inlineLink}>Explore →</Text></Pressable></View>
      <View style={styles.practiceBanner}><Text style={styles.bannerKicker}>READY FOR YOUR NEXT INTERVIEW?</Text><Text style={styles.bannerTitle}>A few minutes of practice can make a big difference.</Text><Pressable style={styles.bannerButton} onPress={startPractice}><Text style={styles.bannerButtonText}>Start practicing →</Text></Pressable></View>
    </ScrollView>;
  };

  return <SafeAreaView style={styles.safe}>
    <StatusBar barStyle="dark-content" backgroundColor={COLORS.canvas} />
    <View style={styles.header}><View style={styles.brandMark}><Text style={styles.brandMarkText}>p</Text></View><Text style={styles.brand}>pathway<Text style={{ color: '#39815b' }}>.</Text></Text><View style={{ flex: 1 }} />{token ? <Pressable onPress={() => { setToken(''); setApplications([]); setTab('Home'); }}><Text style={styles.signOut}>Sign out</Text></Pressable> : <Text style={styles.profile}>AS</Text>}</View>
    <View style={styles.content}>{content()}</View>
    {token ? <View style={styles.tabBar}>{TABS.map((item, index) => <Pressable key={item} onPress={() => setTab(item)} style={styles.tabItem}><Text style={[styles.tabIcon, tab === item && styles.tabActive]}>{['◫', '▤', '✳', '◎'][index]}</Text><Text style={[styles.tabLabel, tab === item && styles.tabActive]}>{item}</Text></Pressable>)}</View> : null}
    <Modal visible={modalOpen} transparent animationType="slide" onRequestClose={() => setModalOpen(false)}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalBackdrop}><View style={styles.modalCard}><ScrollView keyboardShouldPersistTaps="handled"><View style={styles.modalHeader}><View><Text style={styles.kicker}>NEW OPPORTUNITY</Text><Text style={styles.modalTitle}>Add an application</Text></View><Pressable onPress={() => setModalOpen(false)}><Text style={styles.close}>×</Text></Pressable></View>
        <Text style={styles.inputLabel}>COMPANY NAME</Text><TextInput value={company} onChangeText={setCompany} placeholder="e.g. Stripe" style={styles.input} />
        <Text style={styles.inputLabel}>ROLE TITLE</Text><TextInput value={role} onChangeText={setRole} placeholder="e.g. Software Engineer Intern" style={styles.input} />
        <Text style={styles.inputLabel}>NEXT DEADLINE · YYYY-MM-DD</Text><TextInput value={deadline} onChangeText={setDeadline} placeholder="2026-10-30" keyboardType="numbers-and-punctuation" style={styles.input} />
        <Text style={styles.inputLabel}>STATUS</Text><View style={styles.statusChoices}>{['Applied', 'In review', 'Interview', 'Offer'].map((value) => <Pressable key={value} onPress={() => setStatus(value)} style={[styles.statusChoice, status === value && styles.statusChoiceSelected]}><Text style={[styles.statusChoiceText, status === value && styles.statusChoiceTextSelected]}>{value}</Text></Pressable>)}</View>
        <Pressable disabled={!company.trim() || !role.trim() || !deadline.trim()} style={[styles.button, (!company.trim() || !role.trim() || !deadline.trim()) && styles.buttonDisabled]} onPress={saveApplication}><Text style={styles.buttonText}>Save application →</Text></Pressable>
      </ScrollView></View></KeyboardAvoidingView>
    </Modal>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.canvas },
  header: { height: 58, paddingHorizontal: 19, alignItems: 'center', flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: COLORS.line, backgroundColor: COLORS.canvas },
  brandMark: { width: 27, height: 27, borderRadius: 9, backgroundColor: COLORS.green, alignItems: 'center', justifyContent: 'center' }, brandMarkText: { color: COLORS.white, fontSize: 21, fontWeight: '800', marginTop: -3 }, brand: { marginLeft: 8, color: COLORS.ink, fontSize: 18, fontWeight: '800', letterSpacing: -0.8 }, profile: { width: 29, height: 29, borderRadius: 15, overflow: 'hidden', textAlign: 'center', textAlignVertical: 'center', backgroundColor: '#e7eee8', color: '#387656', fontSize: 10, fontWeight: '700' },
  content: { flex: 1 }, pageContent: { padding: 19, paddingBottom: 26 }, center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }, muted: { color: COLORS.muted, fontSize: 13 },
  kicker: { color: '#5f9473', fontSize: 9, fontWeight: '800', letterSpacing: 1.1, marginBottom: 7 }, title: { color: COLORS.ink, fontSize: 24, fontWeight: '800', letterSpacing: -0.9 }, subtitle: { color: COLORS.muted, fontSize: 12, lineHeight: 18, marginTop: 5 },
  statsRow: { flexDirection: 'row', gap: 10, marginTop: 20, marginBottom: 25 }, statCard: { flex: 1, borderRadius: 11, borderWidth: 1, borderColor: COLORS.line, backgroundColor: COLORS.white, padding: 14 }, statLabel: { color: COLORS.muted, fontSize: 8, fontWeight: '700', letterSpacing: 0.6 }, statValue: { color: COLORS.ink, fontSize: 25, fontWeight: '800', marginTop: 8 },
  sectionHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 5, marginBottom: 11 }, sectionTitle: { color: COLORS.ink, fontSize: 15, fontWeight: '700' },
  upcomingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: COLORS.white, padding: 10, borderBottomWidth: 1, borderBottomColor: '#f1f2ef' }, dateBox: { width: 38, height: 40, borderRadius: 7, backgroundColor: '#f6f7f4', alignItems: 'center', justifyContent: 'center' }, dateDay: { color: COLORS.ink, fontSize: 15, fontWeight: '800' }, dateMonth: { color: '#929a93', fontSize: 7, letterSpacing: 0.5 }, companyName: { color: COLORS.ink, fontSize: 11, fontWeight: '700' }, roleName: { color: '#939b94', fontSize: 9, marginTop: 4 },
  badge: { alignSelf: 'flex-start', paddingHorizontal: 7, paddingVertical: 4, overflow: 'hidden', borderRadius: 10, fontSize: 8, fontWeight: '700' }, recommendCard: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderWidth: 1, borderColor: COLORS.line, borderRadius: 10, backgroundColor: COLORS.white }, skillMark: { width: 32, height: 32, borderRadius: 8, backgroundColor: '#f1eff9', alignItems: 'center', justifyContent: 'center' }, skillMarkText: { color: '#7863a7', fontSize: 10, fontWeight: '800' }, cardTitle: { color: COLORS.ink, fontSize: 11, fontWeight: '700' }, inlineLink: { color: '#49835e', fontSize: 10, fontWeight: '700' },
  practiceBanner: { backgroundColor: COLORS.green, borderRadius: 11, padding: 16, marginTop: 18 }, bannerKicker: { color: '#b8d7c4', fontSize: 8, fontWeight: '800', letterSpacing: 0.9 }, bannerTitle: { color: COLORS.white, fontSize: 15, fontWeight: '700', lineHeight: 21, marginTop: 8, maxWidth: 280 }, bannerButton: { alignSelf: 'flex-start', backgroundColor: COLORS.white, borderRadius: 7, paddingHorizontal: 11, paddingVertical: 9, marginTop: 13 }, bannerButtonText: { color: COLORS.green, fontSize: 10, fontWeight: '700' },
  applicationCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.line, borderRadius: 10, padding: 12, marginBottom: 9 }, companyMark: { width: 35, height: 35, borderRadius: 9, backgroundColor: COLORS.pale, alignItems: 'center', justifyContent: 'center' }, companyInitial: { color: COLORS.green, fontSize: 13, fontWeight: '800' }, applicationInfo: { flex: 1, marginLeft: 10, gap: 4 }, applicationMeta: { flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 3 }, deadline: { color: COLORS.muted, fontSize: 9 }, deleteButton: { paddingHorizontal: 8, paddingVertical: 2 }, deleteText: { color: '#9ba29b', fontSize: 18 }, listContent: { paddingHorizontal: 17, paddingBottom: 20 }, smallAdd: { backgroundColor: COLORS.green, paddingHorizontal: 11, paddingVertical: 8, borderRadius: 7 }, smallAddText: { color: COLORS.white, fontSize: 10, fontWeight: '700' }, emptyText: { color: COLORS.muted, textAlign: 'center', marginTop: 35, fontSize: 12 },
  featureCard: { backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.line, borderRadius: 12, padding: 16, marginTop: 16 }, cardLabel: { color: COLORS.muted, fontSize: 8, fontWeight: '800', letterSpacing: 0.9 }, question: { color: COLORS.ink, fontSize: 20, lineHeight: 28, fontWeight: '700', marginTop: 12 }, hintIntro: { color: COLORS.muted, fontSize: 10, lineHeight: 16, marginTop: 11 }, answerInput: { minHeight: 112, marginTop: 15, padding: 11, borderWidth: 1, borderColor: COLORS.line, borderRadius: 8, color: COLORS.ink, fontSize: 12 }, hint: { color: '#55735e', backgroundColor: '#f2f7f3', padding: 10, borderRadius: 7, fontSize: 10, lineHeight: 15, marginTop: 10 }, button: { backgroundColor: COLORS.green, borderRadius: 7, minHeight: 42, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 14 }, buttonText: { color: COLORS.white, fontSize: 11, fontWeight: '700' }, buttonDisabled: { opacity: 0.45 }, ornament: { fontSize: 28, color: '#dbece1' }, skillHeading: { flexDirection: 'row', alignItems: 'center', gap: 10 }, match: { color: '#4f8b60', fontSize: 10, fontWeight: '800', backgroundColor: '#edf6ef', padding: 7, borderRadius: 6 }, meter: { height: 5, borderRadius: 4, backgroundColor: '#f0f2ef', marginTop: 18, overflow: 'hidden' }, meterFill: { width: '62%', height: '100%', backgroundColor: '#8abb91' }, topic: { flexDirection: 'row', alignItems: 'center', paddingVertical: 13, borderTopWidth: 1, borderTopColor: '#f0f2ef', marginTop: 8 }, topicNumber: { color: '#6e9b7a', fontSize: 9, fontWeight: '700', width: 28 }, topicTitle: { color: COLORS.ink, fontSize: 10, fontWeight: '600', flex: 1 }, topicTime: { color: COLORS.muted, fontSize: 9 },
  errorCard: { margin: 20, marginTop: 36, backgroundColor: COLORS.white, padding: 18, borderRadius: 11, borderWidth: 1, borderColor: COLORS.line, gap: 12 }, errorTitle: { color: COLORS.ink, fontSize: 16, fontWeight: '700' }, errorText: { color: COLORS.muted, fontSize: 11, lineHeight: 16 }, authError: { color: '#ae4c42', backgroundColor: '#fdf1f0', padding: 9, borderRadius: 6, fontSize: 10, marginTop: 12 }, authFootnote: { color: '#959d96', fontSize: 9, textAlign: 'center', marginTop: 15 }, signOut: { color: COLORS.green, fontSize: 10, fontWeight: '700', marginRight: 5 },
  tabBar: { height: 60, borderTopWidth: 1, borderTopColor: COLORS.line, backgroundColor: COLORS.white, flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', paddingBottom: Platform.OS === 'ios' ? 0 : 3 }, tabItem: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3 }, tabIcon: { color: '#929a93', fontSize: 16 }, tabLabel: { color: '#929a93', fontSize: 8, fontWeight: '600' }, tabActive: { color: COLORS.green, fontWeight: '800' },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#17231db3' }, modalCard: { maxHeight: '92%', backgroundColor: COLORS.white, borderTopLeftRadius: 17, borderTopRightRadius: 17, padding: 20, paddingBottom: 30 }, modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }, modalTitle: { color: COLORS.ink, fontSize: 20, fontWeight: '800', marginTop: 3 }, close: { color: COLORS.muted, fontSize: 27, paddingHorizontal: 6 }, inputLabel: { color: '#69736b', fontSize: 8, fontWeight: '800', letterSpacing: 0.6, marginTop: 12, marginBottom: 6 }, input: { borderWidth: 1, borderColor: '#e5eae5', borderRadius: 7, paddingHorizontal: 11, paddingVertical: 11, color: COLORS.ink, fontSize: 11 }, statusChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 16 }, statusChoice: { borderWidth: 1, borderColor: '#e5eae5', borderRadius: 15, paddingHorizontal: 10, paddingVertical: 7 }, statusChoiceSelected: { backgroundColor: COLORS.pale, borderColor: '#cce3d2' }, statusChoiceText: { color: COLORS.muted, fontSize: 9 }, statusChoiceTextSelected: { color: COLORS.green, fontWeight: '700' }
});
