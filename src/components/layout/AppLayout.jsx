function AppLayout({ children }) {
  const handleLogout = async () => {
    const supabase = (await import("../../supabaseClient")).default;
    await supabase.auth.signOut();
  };

  return (
    <div>
      <header className="p-10 border-b border-gray-300">
        <strong>AC Service App</strong>
        <button className="float-right" onClick={handleLogout}>
          Logout
        </button>
      </header>

      <main style={{ padding: 20 }}>{children}</main>
    </div>
  );
}

export default AppLayout;
