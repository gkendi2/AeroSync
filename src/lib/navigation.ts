import type { useRouter } from 'expo-router';

type Router = ReturnType<typeof useRouter>;

/**
 * Back button for screens opened from the dashboard or the More page:
 * returns to the previous screen (the tab navigator keeps screen history),
 * or to the dashboard when there is nothing to go back to.
 */
export function goBackOrHome(router: Router) {
  if (router.canGoBack()) {
    router.back();
  } else {
    router.navigate('/');
  }
}
