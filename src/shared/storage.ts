const TOKEN_KEY = 'github_token';
const USER_KEY = 'github_user';

export interface GitHubUser {
  login: string;
  avatar_url: string;
}

export async function getToken(): Promise<string | null> {
  const result = await chrome.storage.local.get(TOKEN_KEY);
  return (result[TOKEN_KEY] as string) ?? null;
}

export async function setToken(token: string): Promise<void> {
  await chrome.storage.local.set({ [TOKEN_KEY]: token });
}

export async function clearToken(): Promise<void> {
  await chrome.storage.local.remove([TOKEN_KEY, USER_KEY]);
}

export async function getUser(): Promise<GitHubUser | null> {
  const result = await chrome.storage.local.get(USER_KEY);
  return (result[USER_KEY] as GitHubUser) ?? null;
}

export async function setUser(user: GitHubUser): Promise<void> {
  await chrome.storage.local.set({ [USER_KEY]: user });
}
