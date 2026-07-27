import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, Platform, SafeAreaView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import Constants from 'expo-constants';

// Where the WebView points is the one thing you'll want to change —
// see app.json's expo.extra.gameUrl for the default and how to override
// it (mobile/README.md walks through both the deployed-URL and local-dev
// LAN setups). Nothing else here needs touching to test the game.
const GAME_URL = Constants.expoConfig?.extra?.gameUrl ?? 'http://localhost:8080';

// Midnight Garage's own dark background (index.html's theme-color /
// capacitor.config.json's splash background) — matched here so there's
// no white flash while the WebView loads, same reasoning as the native
// splash screen config.
const BG = '#0b0e14';

export default function App() {
  const webviewRef = useRef(null);
  const canGoBackRef = useRef(false);
  const [loadFailed, setLoadFailed] = useState(false);

  // Android's hardware back button should step back through the game's
  // own in-app navigation (overlays, levels) via WebView history before
  // ever falling through to closing the app — mirrors what a real back
  // gesture does in the Capacitor build. iOS gets the equivalent via
  // react-native-webview's edge-swipe gesture below, so this is
  // Android-only.
  useEffect(() => {
    if(Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if(canGoBackRef.current && webviewRef.current){
        webviewRef.current.goBack();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={BG} />
      {loadFailed ? (
        <View style={styles.center}>
          <Text style={styles.errorTitle}>Can't reach the game</Text>
          <Text style={styles.errorBody}>
            {GAME_URL}{'\n\n'}Check the URL in mobile/app.json's expo.extra.gameUrl —
            see mobile/README.md if you're pointing this at a local dev server.
          </Text>
        </View>
      ) : (
        <WebView
          ref={webviewRef}
          source={{ uri: GAME_URL }}
          style={styles.webview}
          containerStyle={{ backgroundColor: BG }}
          startInLoadingState
          renderLoading={() => (
            <View style={[styles.center, StyleSheet.absoluteFill]}>
              <ActivityIndicator size="large" color="#ffb454" />
            </View>
          )}
          onNavigationStateChange={navState => { canGoBackRef.current = navState.canGoBack; }}
          onError={() => setLoadFailed(true)}
          onHttpError={() => setLoadFailed(true)}
          allowsBackForwardNavigationGestures={Platform.OS === 'ios'}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  webview: { flex: 1, backgroundColor: BG },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: BG },
  errorTitle: { color: '#e8ecf4', fontSize: 18, fontWeight: '700', marginBottom: 12 },
  errorBody: { color: '#8a93a6', fontSize: 13, textAlign: 'center', lineHeight: 19 },
});
