import { useRoute } from './lib/router';
import { DashboardScreen } from './screens/DashboardScreen';
import { JoinScreen } from './screens/JoinScreen';
import { PrivacyScreen } from './screens/PrivacyScreen';
import { SessionScreen } from './screens/SessionScreen';

export function App() {
  const route = useRoute();
  switch (route.name) {
    case 'join':
      return <JoinScreen />;
    case 'session':
      return <SessionScreen key={route.code} code={route.code} />;
    case 'privacy':
      return <PrivacyScreen />;
    case 'dashboard':
      return <DashboardScreen />;
    case 'notFound':
      return <JoinScreen />;
  }
}
