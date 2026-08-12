import React from 'react';
import { useAuthSession } from './hooks/useAuthSession';
import LoginScreen from './components/LoginScreen';
import AuthenticatedApp from './components/AuthenticatedApp';

const App: React.FC = () => {
  const session = useAuthSession();

  if (!session.isAuthenticated) {
    return (
      <LoginScreen
        language={session.language}
        loginEmail={session.loginEmail}
        setLoginEmail={session.setLoginEmail}
        loginPassword={session.loginPassword}
        setLoginPassword={session.setLoginPassword}
        onSubmit={session.handleLogin}
        appText={session.appText}
        alertDialog={session.alertDialog}
        onCloseAlert={session.closeAlert}
      />
    );
  }

  return <AuthenticatedApp session={session} />;
};

export default App;
