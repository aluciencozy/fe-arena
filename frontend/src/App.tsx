import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "@/context/AuthContext";
import Account from "@/pages/Account";
import CPractice from "@/pages/CPractice";
import Home from "@/pages/Home";
import Room from "@/pages/Room";
import Solo from "@/pages/Solo";
import { isDevelopmentBuild } from "@/lib/environment";

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/room/:id" element={<Room />} />
          <Route path="/solo" element={<Solo />} />
          <Route
            path="/practice/c"
            element={isDevelopmentBuild ? <CPractice /> : <Navigate to="/" replace />}
          />
          <Route path="/account" element={<Account />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
