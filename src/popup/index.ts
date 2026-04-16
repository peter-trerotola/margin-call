interface AuthStateResponse {
  authenticated: boolean;
  user: { login: string; avatar_url: string } | null;
  error?: string;
}

function showState(stateId: string) {
  for (const el of document.querySelectorAll('.state')) {
    (el as HTMLElement).hidden = el.id !== stateId;
  }
}

function showError(message: string) {
  const errorMsg = document.getElementById('error-msg')!;
  errorMsg.textContent = message;
  showState('error');
}

function showSignedIn(user: { login: string; avatar_url: string }) {
  const avatar = document.getElementById('user-avatar') as HTMLImageElement;
  const login = document.getElementById('user-login')!;
  avatar.src = user.avatar_url;
  login.textContent = user.login;
  showState('signed-in');
}

async function checkAuthState() {
  showState('loading');
  const response = (await chrome.runtime.sendMessage({
    type: 'getAuthState',
  })) as AuthStateResponse;

  if (response.error) {
    showError(response.error);
  } else if (response.authenticated && response.user) {
    showSignedIn(response.user);
  } else {
    showState('signed-out');
  }
}

document.getElementById('sign-in-btn')!.addEventListener('click', async () => {
  showState('loading');
  const response = (await chrome.runtime.sendMessage({
    type: 'startAuth',
  })) as AuthStateResponse;

  if (response.error) {
    showError(response.error);
  } else if (response.authenticated && response.user) {
    showSignedIn(response.user);
  } else {
    showError('Authentication failed');
  }
});

document
  .getElementById('sign-out-btn')!
  .addEventListener('click', async () => {
    await chrome.runtime.sendMessage({ type: 'logout' });
    showState('signed-out');
  });

document.getElementById('retry-btn')!.addEventListener('click', () => {
  checkAuthState();
});

checkAuthState();
