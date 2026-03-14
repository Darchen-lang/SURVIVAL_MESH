import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { View, Text, StyleSheet } from 'react-native';
import MeshScreen from './src/screens/MeshScreen';
import ChatScreen from './src/screens/ChatScreen';
import BulletinScreen from './src/screens/BulletinScreen';
import TriageScreen from './src/screens/TriageScreen';
import IdentityScreen from './src/screens/IdentityScreen';
import SurvivalScreen from './src/screens/SurvivalScreen';
import NavigationScreen from './src/screens/NavigationScreen';

const Tab = createBottomTabNavigator();

function TabIcon({ name, focused }: { name: string; focused: boolean }) {
  return (
    <View style={styles.iconContainer}>
      <Text style={[styles.iconText, focused && styles.iconFocused]}>
        {name === 'Mesh'
          ? '⬡'
          : name === 'Chat'
            ? '◉'
            : name === 'Bulletin'
              ? '◈'
              : name === 'Triage'
                ? '✚'
                : name === 'Identity'
                  ? '⌁'
                  : name === 'Survival'
                    ? '▦'
                    : '⌖'}
      </Text>
    </View>
  );
}

export default function App() {
  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: '#0a0a0a' },
          headerTintColor: '#00ff88',
          headerTitleStyle: { fontWeight: 'bold', letterSpacing: 2 },
          tabBarStyle: {
            backgroundColor: '#0a0a0a',
            borderTopColor: '#1a1a1a',
            paddingBottom: 8,
            height: 60,
          },
          tabBarActiveTintColor: '#00ff88',
          tabBarInactiveTintColor: '#444',
        }}
      >
        <Tab.Screen
          name="Mesh"
          component={MeshScreen}
          options={{
            title: 'MESH',
            tabBarIcon: ({ focused }) => <TabIcon name="Mesh" focused={focused} />,
          }}
        />
        <Tab.Screen
          name="Chat"
          component={ChatScreen}
          options={{
            title: 'CHAT',
            tabBarIcon: ({ focused }) => <TabIcon name="Chat" focused={focused} />,
          }}
        />
        <Tab.Screen
          name="Bulletin"
          component={BulletinScreen}
          options={{
            title: 'BULLETIN',
            tabBarIcon: ({ focused }) => <TabIcon name="Bulletin" focused={focused} />,
          }}
        />
        <Tab.Screen
          name="Triage"
          component={TriageScreen}
          options={{
            title: 'TRIAGE',
            tabBarIcon: ({ focused }) => <TabIcon name="Triage" focused={focused} />,
          }}
        />
        <Tab.Screen
          name="Identity"
          component={IdentityScreen}
          options={{
            title: 'IDENTITY',
            tabBarIcon: ({ focused }) => <TabIcon name="Identity" focused={focused} />,
          }}
        />
        <Tab.Screen
          name="Survival"
          component={SurvivalScreen}
          options={{
            title: 'SURVIVAL',
            tabBarIcon: ({ focused }) => <TabIcon name="Survival" focused={focused} />,
          }}
        />
        <Tab.Screen
          name="Navigate"
          component={NavigationScreen}
          options={{
            title: 'NAVIGATE',
            tabBarIcon: ({ focused }) => <TabIcon name="Navigate" focused={focused} />,
          }}
        />
      </Tab.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  iconContainer: { alignItems: 'center', justifyContent: 'center' },
  iconText: { fontSize: 20, color: '#444' },
  iconFocused: { color: '#00ff88' },
});