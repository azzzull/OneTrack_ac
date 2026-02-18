import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import loginimage from "../assets/img/loginimage.jpg";
import { Wrench, Loader2 } from "lucide-react";

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const { login, user, role } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user && role) {
      if (role === "admin") navigate("/admin");
      else if (role === "technician") navigate("/technician");
      else if (role === "customer") navigate("/customer");
    }
  }, [user, role, navigate]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      await login(email, password);
    } catch (error) {
      alert(error.message);
    }

    setLoading(false);
  };

  return (
    <section
      onSubmit={handleLogin}
      className="min-h-screen flex items-center justify-center bg-sky-50"
    >
      <div className="flex shadow-2xl rounded-2xl overflow-hidden">
        <form
          className="flex flex-col items-center justify-center text-center p-20 gap-2 bg-white rounded-2xl lg:rounded-tr-none lg:rounded-br-none
        "
        >
          <div className="p-3 bg-sky-400 rounded-2xl text-white">
            <Wrench size={32} />
          </div>
          <div>
            <h1 className="text-4xl font-bold text-sky-400 mb-1">
              OneTrack Service
            </h1>
            <p className="text-gray-400">Manajemen Service AC Profesional</p>
          </div>
          <div className="flex flex-col text-left gap-1 w-full my-6">
            <span>Email</span>
            <input
              type="email"
              placeholder="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="border border-sky-100 py-1 px-2 outline-none rounded-md focus:border-sky-400 focus:bg-sky-50 mb-2 placeholder:text-gray-300"
            />
            <span>Password</span>
            <input
              type="password"
              placeholder="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="border border-sky-100 py-1 px-2 outline-none rounded-md focus:border-sky-400 focus:bg-sky-50 placeholder:text-gray-300"
            />
          </div>
          <div className="flex flex-col w-full">
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 font-semibold rounded-2xl bg-sky-400 text-white hover:bg-sky-500 hover:text-white hover:cursor-pointer duration-200 ease-in hover:scale-105 my-2"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="animate-spin w-4 h-4" />
                  <span>Menyinkronkan...</span>
                </span>
              ) : (
                "Masuk Ke Sistem"
              )}
            </button>
          </div>
        </form>
        <img
          src={loginimage}
          alt=""
          className="w-112.5 object-cover rounded-tr-2xl rounded-br-2xl lg:block hidden"
        />
      </div>
    </section>
  );
}

export default Login;
