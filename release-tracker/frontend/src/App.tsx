import { BrowserRouter, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import FollowedListPage from './pages/FollowedListPage'
import SearchPage from './pages/SearchPage'
import CalendarPage from './pages/CalendarPage'
import ArtistPage from './pages/ArtistPage'
import SettingsPage from './pages/SettingsPage'
import MetubePage from './pages/MetubePage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<FollowedListPage />} />
          <Route path="search" element={<SearchPage />} />
          <Route path="calendar" element={<CalendarPage />} />
          <Route path="artists/:id" element={<ArtistPage />} />
          <Route path="metube" element={<MetubePage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
