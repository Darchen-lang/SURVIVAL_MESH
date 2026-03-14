import * as Notifications from 'expo-notifications';
import { useEffect, useRef, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator, type BottomTabBarProps } from '@react-navigation/bottom-tabs';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Platform,
  type LayoutChangeEvent,
} from 'react-native';
import MeshScreen from './src/screens/MeshScreen';
import ChatScreen from './src/screens/ChatScreen';
import BulletinScreen from './src/screens/BulletinScreen';
import IdentityScreen from './src/screens/IdentityScreen';
import NavigationScreen from './src/screens/NavigationScreen';
import TriageScreen from './src/screens/TriageScreen';
import SurvivalScreen from './src/screens/SurvivalScreen';
import SystemsScreen from './src/screens/SystemsScreen';
import MapScreen from './src/screens/MapScreen';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

const Tab = createBottomTabNavigator();

const TAB_ICONS: Record<string, string> = {
  Mesh: '⬡',
  Chat: '◉',
  Bulletin: '◈',
  Identity: '◎',
  Map: '⌖',
  Navigate: '◬',
  Triage: '✚',
  Survival: '◆',
  Systems: '⚙',
};

function SlidingTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const scrollRef = useRef<ScrollView | null>(null);
  const itemLayouts = useRef<Record<string, { x: number; width: number }>>({});
  const [railWidth, setRailWidth] = useState(0);

  const focusedKey = state.routes[state.index]?.key;

  const syncFocusedTab = () => {
    if (!focusedKey) {
      return;
    }

    const layout = itemLayouts.current[focusedKey];
    if (!layout) {
      return;
    }

    if (railWidth > 0) {
      const centeredX = Math.max(0, layout.x + layout.width / 2 - railWidth / 2);
      scrollRef.current?.scrollTo({ x: centeredX, animated: true });
    }
  };

  useEffect(() => {
    syncFocusedTab();
  }, [focusedKey, railWidth]);

  const onRailLayout = (event: LayoutChangeEvent) => {
    setRailWidth(event.nativeEvent.layout.width);
  };

  const onTabLayout = (routeKey: string, event: LayoutChangeEvent) => {
    const { x, width } = event.nativeEvent.layout;
    itemLayouts.current[routeKey] = { x, width };

    if (routeKey === focusedKey) {
      syncFocusedTab();
    }
  };

  return (
    <View style={styles.tabRailOuter}>
      <View style={styles.tabRailInner}>
        <ScrollView
          ref={scrollRef}
          onLayout={onRailLayout}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabRailContent}
        >
          {state.routes.map((route, index) => {
            const { options } = descriptors[route.key];
            const label =
              typeof options.tabBarLabel === 'string'
                ? options.tabBarLabel
                : typeof options.title === 'string'
                ? options.title
                : route.name;

            const focused = state.index === index;

            const onPress = () => {
              const event = navigation.emit({
                type: 'tabPress',
                target: route.key,
                canPreventDefault: true,
              });

              if (!focused && !event.defaultPrevented) {
                navigation.navigate(route.name, route.params);
              }
            };

            const onLongPress = () => {
              navigation.emit({
                type: 'tabLongPress',
                target: route.key,
              });
            };

            return (
              <Pressable
                key={route.key}
                onLayout={(event) => onTabLayout(route.key, event)}
                accessibilityRole="button"
                accessibilityState={focused ? { selected: true } : {}}
                accessibilityLabel={options.tabBarAccessibilityLabel}
                testID={options.tabBarButtonTestID}
                onPress={onPress}
                onLongPress={onLongPress}
                style={[styles.tabPill, focused && styles.tabPillActive]}
              >
                <Text style={[styles.tabIcon, focused && styles.tabIconActive]}>
                  {TAB_ICONS[route.name] ?? '●'}
                </Text>
                <Text style={[styles.tabLabel, focused && styles.tabLabelActive]}>
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    </View>
  );
}

export default function App() {
  useEffect(() => {
    // Initialize any required services here
  }, []);

  return (
    <NavigationContainer>
      <Tab.Navigator
        tabBar={(props) => <SlidingTabBar {...props} />}
        screenOptions={{
          animation: 'none',
          headerStyle: { backgroundColor: '#0a0a0a' },
          headerTintColor: '#00ff88',
          headerTitleStyle: { fontWeight: 'bold', letterSpacing: 2 },
          sceneStyle: { backgroundColor: '#07090b' },
        }}
      >
        <Tab.Screen name="Mesh" component={MeshScreen}
          options={{ title: 'MESH' }} />
        <Tab.Screen name="Chat" component={ChatScreen}
          options={{ title: 'CHAT' }} />
        <Tab.Screen name="Bulletin" component={BulletinScreen}
          options={{ title: 'BULLETIN' }} />
        <Tab.Screen name="Identity" component={IdentityScreen}
          options={{ title: 'IDENTITY' }} />
        <Tab.Screen name="Map" component={MapScreen}
          options={{ title: 'MAP' }} />
        <Tab.Screen name="Navigate" component={NavigationScreen}
          options={{ title: 'NAVIGATE' }} />
        <Tab.Screen name="Triage" component={TriageScreen}
          options={{ title: 'TRIAGE' }} />
        <Tab.Screen name="Systems" component={SystemsScreen}
          options={{ title: 'SYSTEMS' }} />
        <Tab.Screen name="Survival" component={SurvivalScreen}
          options={{ title: 'SURVIVAL' }} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  tabRailOuter: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 10,
    paddingBottom: Platform.OS === 'ios' ? 20 : 10,
    paddingTop: 8,
    backgroundColor: 'transparent',
  },
  tabRailInner: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#1d2a2f',
    backgroundColor: '#0c1316',
    shadowColor: '#000',
    shadowOpacity: 0.32,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  tabRailContent: {
    paddingVertical: 8,
    paddingHorizontal: 8,
    gap: 8,
  },
  tabPill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#223139',
    backgroundColor: '#101c21',
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 6,
  },
  tabPillActive: {
    borderColor: '#00ff88',
    backgroundColor: '#0f2a22',
  },
  tabIcon: {
    fontSize: 15,
    color: '#7f9098',
    marginRight: 6,
  },
  tabIconActive: {
    color: '#00ff88',
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    color: '#7f9098',
  },
  tabLabelActive: {
    color: '#00ff88',
  },
});