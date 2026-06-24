export async function initSteamProfile() {
  const profileEl = document.getElementById("steamProfile");
  const usernameEl = document.getElementById("steamUsername");
  if (!profileEl || !usernameEl) return;

  profileEl.style.display = "flex";

  if (!window.api?.steamworks) {
    usernameEl.textContent = "OFFLINE";
    profileEl.classList.add("offline");
    return;
  }

  try {
    const profile = await window.api.steamworks.userInfo();
    if (profile?.name) {
      usernameEl.textContent = profile.name;
      profileEl.classList.add("linked");
    } else {
      usernameEl.textContent = "OFFLINE";
      profileEl.classList.add("offline");
    }
  } catch {
    usernameEl.textContent = "OFFLINE";
    profileEl.classList.add("offline");
  }
}
