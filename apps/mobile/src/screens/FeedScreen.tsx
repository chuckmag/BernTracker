import { StyleSheet, Text, View } from 'react-native'

export default function FeedScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>WODalytics</Text>
      <Text style={styles.subtitle}>Today's WOD coming soon</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#030712',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#9ca3af',
  },
})
