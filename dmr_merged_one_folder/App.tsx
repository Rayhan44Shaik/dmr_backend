import { BrowserRouter } from 'react-router-dom';
import { ThemeProvider } from './providers/ThemeProvider';
import { AuthProvider } from './providers/AuthProvider';
import { SettingsProvider } from './providers/SettingsProvider';
import { NotificationProvider } from './providers/NotificationProvider';
import { ToastProvider } from './components/common/ToastProvider';
import AppRoutes from './routes/AppRoutes';

function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <SettingsProvider>
            <NotificationProvider>
              <ToastProvider>
                <AppRoutes />
              </ToastProvider>
            </NotificationProvider>
          </SettingsProvider>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}

export default App;