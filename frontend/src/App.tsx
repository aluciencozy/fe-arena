import { BrowserRouter, Route, Routes } from "react-router-dom";
import Home from "@/pages/Home";
import Room from "@/pages/Room";
import Solo from "@/pages/Solo";

export default function App() {
  return <BrowserRouter><Routes><Route path="/" element={<Home />} /><Route path="/room/:id" element={<Room />} /><Route path="/solo" element={<Solo />} /></Routes></BrowserRouter>;
}
