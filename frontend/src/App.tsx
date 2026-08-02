import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AuthProvider } from "@/context/AuthContext";
import Account from "@/pages/Account";
import Home from "@/pages/Home";
import Room from "@/pages/Room";
import Solo from "@/pages/Solo";

export default function App() {
  return <AuthProvider><BrowserRouter><Routes><Route path="/" element={<Home />} /><Route path="/room/:id" element={<Room />} /><Route path="/solo" element={<Solo />} /><Route path="/account" element={<Account />} /></Routes></BrowserRouter></AuthProvider>;
}
