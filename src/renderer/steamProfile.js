export async function initSteamProfile() {
  const profileEls = document.querySelectorAll("#steamProfile, #sidebarSteamProfile");
  const usernameEls = document.querySelectorAll("#steamUsername, #sidebarSteamUsername");
  if (profileEls.length === 0 || usernameEls.length === 0) return;

  profileEls.forEach(el => el.style.display = "flex");

  if (!window.api?.steamworks) {
    usernameEls.forEach(el => el.textContent = "OFFLINE");
    profileEls.forEach(el => el.classList.add("offline"));
    return;
  }

  try {
    const profile = await window.api.steamworks.userInfo();
    if (profile?.name) {
      usernameEls.forEach(el => el.textContent = profile.name);
      profileEls.forEach(el => el.classList.add("linked"));
    } else {
      usernameEls.forEach(el => el.textContent = "OFFLINE");
      profileEls.forEach(el => el.classList.add("offline"));
    }
  } catch {
    usernameEls.forEach(el => el.textContent = "OFFLINE");
    profileEls.forEach(el => el.classList.add("offline"));
  }
}
