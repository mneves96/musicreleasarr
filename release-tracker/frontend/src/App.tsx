import { BrowserRouter, Route, Routes } from 'react-router-dom'
import AuthGate from './components/AuthGate'
import Layout from './components/Layout'
import ArtistsPage from './pages/ArtistsPage'
import SearchPage from './pages/SearchPage'
import CalendarPage from './pages/CalendarPage'
import ArtistPage from './pages/ArtistPage'
import SettingsPage from './pages/SettingsPage'
import MetubePage from './pages/MetubePage'
import BacklogPage from './pages/BacklogPage'
import { PlayerProvider } from './context/PlayerContext'

export default function App() {
  return (
    <AuthGate>
      <PlayerProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<ArtistsPage />} />
              <Route path="search" element={<SearchPage />} />
              <Route path="calendar" element={<CalendarPage />} />
              <Route path="artists/:id" element={<ArtistPage />} />
              <Route path="metube" element={<MetubePage />} />
              <Route path="backlog" element={<BacklogPage />} />
              <Route path="settings" element={<SettingsPage />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </PlayerProvider>
    </AuthGate>
  )
}
