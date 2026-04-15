import { BrowserRouter, Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import Room from "./pages/Room";

export default function App() {
  return (
    // BrowserRouter: engine that watches the URL bar in the browser.
    <BrowserRouter>
      {/* Routes: decides which component to render based on the URL */}
      <Routes>
        <Route path="/" element={<Home />} />
        
        {/* Route for the game room, capturing the room ID as a parameter */}
        <Route path="/room/:id" element={<Room />} />
      </Routes>
    </BrowserRouter>
  );
}