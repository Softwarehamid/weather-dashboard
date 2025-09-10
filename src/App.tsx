import { useCallback, useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Sun, Moon, Search, MapPin, Thermometer, Wind, Droplets, Eye, Sunrise, Sunset } from 'lucide-react'

// Types
type Units = 'metric' | 'imperial'

interface Geo {
  name: string
  lat: number
  lon: number
  country: string
  state?: string
}

interface WeatherNow {
  name: string
  dt: number
  sys: { country: string; sunrise: number; sunset: number }
  weather: { id: number; main: string; description: string; icon: string }[]
  main: { temp: number; feels_like: number; humidity: number; pressure: number; temp_min: number; temp_max: number }
  wind: { speed: number; deg: number }
  visibility: number
}

interface ForecastItem {
  dt: number
  dt_txt: string
  main: { temp: number; feels_like: number; humidity: number }
  weather: { id: number; main: string; description: string; icon: string }[]
  wind: { speed: number; deg: number }
}

interface ForecastRes { 
  list: ForecastItem[]
  city: { name: string; country: string; timezone: number }
}

const API = 'https://api.openweathermap.org'
const KEY = import.meta.env.VITE_OPENWEATHER_API_KEY as string

const RECENT_KEY = 'wd_recent_cities'
const THEME_KEY = 'wd_theme'

function useTheme() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem(THEME_KEY)
    return (saved as 'light' | 'dark') || 'light'
  })
  
  useEffect(() => {
    const root = document.documentElement
    if (theme === 'dark') {
      root.classList.add('dark')
    } else {
      root.classList.remove('dark')
    }
    localStorage.setItem(THEME_KEY, theme)
  }, [theme])
  
  return { theme, setTheme }
}

// Utility functions
function degToCompass(num: number) {
  const val = Math.floor((num / 22.5) + 0.5)
  const arr = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW']
  return arr[val % 16]
}

function tempUnit(units: Units) { 
  return units === 'metric' ? '°C' : '°F' 
}

function speedUnit(units: Units) { 
  return units === 'metric' ? 'm/s' : 'mph' 
}

function formatTime(timestamp: number) {
  return new Date(timestamp * 1000).toLocaleTimeString(undefined, { 
    hour: '2-digit', 
    minute: '2-digit' 
  })
}

function pickDaily(list: ForecastItem[]) {
  // Group by date (YYYY-MM-DD) and pick the item closest to 12:00
  const groups: Record<string, ForecastItem[]> = {}
  for (const item of list) {
    const day = item.dt_txt.split(' ')[0]
    groups[day] ??= []
    groups[day].push(item)
  }
  
  const days = Object.keys(groups).sort()
  const results: ForecastItem[] = []
  
  for (const day of days) {
    const items = groups[day]
    let best = items[0]
    let bestDiff = Infinity
    
    for (const it of items) {
      const hour = Number(it.dt_txt.split(' ')[1].slice(0, 2))
      const diff = Math.abs(12 - hour)
      if (diff < bestDiff) { 
        bestDiff = diff
        best = it 
      }
    }
    results.push(best)
  }
  
  // Return next 5 days (skip today if partial)
  return results.slice(0, 5)
}

// API calls
async function geocode(city: string): Promise<Geo | null> {
  if (!KEY) throw new Error('API key not configured')
  
  const res = await fetch(`${API}/geo/1.0/direct?q=${encodeURIComponent(city)}&limit=1&appid=${KEY}`)
  if (!res.ok) throw new Error('Geocoding failed')
  
  const data = await res.json()
  return data?.[0] ?? null
}

async function current(lat: number, lon: number, units: Units): Promise<WeatherNow> {
  if (!KEY) throw new Error('API key not configured')
  
  const res = await fetch(`${API}/data/2.5/weather?lat=${lat}&lon=${lon}&units=${units}&appid=${KEY}`)
  if (!res.ok) throw new Error('Weather data failed to load')
  
  return res.json()
}

async function forecast(lat: number, lon: number, units: Units): Promise<ForecastRes> {
  if (!KEY) throw new Error('API key not configured')
  
  const res = await fetch(`${API}/data/2.5/forecast?lat=${lat}&lon=${lon}&units=${units}&appid=${KEY}`)
  if (!res.ok) throw new Error('Forecast data failed to load')
  
  return res.json()
}

export default function App() {
  const { theme, setTheme } = useTheme()
  const [units, setUnits] = useState<Units>('imperial')
  const [q, setQ] = useState('Minneapolis')
  const [city, setCity] = useState<Geo | null>(null)
  const [now, setNow] = useState<WeatherNow | null>(null)
  const [fc, setFc] = useState<ForecastItem[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [recent, setRecent] = useState<string[]>(() => {
    try { 
      return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]') 
    } catch { 
      return [] 
    }
  })

  // Dynamic background based on weather conditions
  const bgClass = useMemo(() => {
    const main = now?.weather?.[0]?.main || 'Clear'
    
    if (theme === 'dark') {
      return 'bg-gradient-to-br from-slate-950 via-slate-900 to-slate-900'
    }
    
    switch (main) {
      case 'Clear': 
        return 'bg-gradient-to-br from-sky-200 via-sky-100 to-indigo-100'
      case 'Clouds': 
        return 'bg-gradient-to-br from-slate-200 via-slate-100 to-slate-50'
      case 'Rain': 
        return 'bg-gradient-to-br from-cyan-200 via-blue-200 to-slate-100'
      case 'Snow': 
        return 'bg-gradient-to-br from-sky-50 via-white to-slate-100'
      case 'Thunderstorm': 
        return 'bg-gradient-to-br from-indigo-300 via-slate-300 to-zinc-200'
      case 'Drizzle':
        return 'bg-gradient-to-br from-blue-100 via-slate-100 to-cyan-50'
      case 'Mist':
      case 'Fog':
        return 'bg-gradient-to-br from-slate-200 via-gray-100 to-slate-50'
      default: 
        return 'bg-gradient-to-br from-slate-100 to-sky-100'
    }
  }, [now, theme])

  const unitLabel = tempUnit(units)

  const saveRecent = useCallback((name: string) => {
    const next = [name, ...recent.filter(c => c.toLowerCase() !== name.toLowerCase())].slice(0, 6)
    setRecent(next)
    localStorage.setItem(RECENT_KEY, JSON.stringify(next))
  }, [recent])

  const runSearch = useCallback(async (cityName: string) => {
    if (!cityName.trim()) return
    
    if (!KEY) { 
      setError('Missing API key. Set VITE_OPENWEATHER_API_KEY environment variable.') 
      return 
    }
    
    setLoading(true)
    setError(null)
    
    try {
      const g = await geocode(cityName)
      if (!g) throw new Error('City not found')
      
      setCity(g)
      const [w, f] = await Promise.all([
        current(g.lat, g.lon, units), 
        forecast(g.lat, g.lon, units)
      ])
      
      setNow(w)
      setFc(pickDaily(f.list))
      saveRecent(g.name)
    } catch (e: any) {
      setError(e.message || 'Something went wrong')
      setNow(null)
      setFc(null)
    } finally { 
      setLoading(false) 
    }
  }, [units, saveRecent])

  // Initial search
  useEffect(() => { 
    runSearch(q) 
  }, [])
  
  // Re-fetch when units change for the same city
  useEffect(() => { 
    if (city) runSearch(city.name) 
  }, [units])

  const handleSearch = () => runSearch(q)
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch()
  }

  return (
    <div className={`min-h-screen ${bgClass} transition-all duration-500`}>
      <div className="container py-6 md:py-10">
        {/* Header */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-8">
          <motion.div 
            initial={{ opacity: 0, y: -20 }} 
            animate={{ opacity: 1, y: 0 }} 
            transition={{ duration: 0.3 }}
          >
            <h1 className="text-3xl md:text-4xl font-bold text-slate-800 dark:text-slate-100">
              Weather Dashboard
            </h1>
            <p className="text-slate-600 dark:text-slate-400 mt-1">
              Search any city for current weather and 5-day forecast
            </p>
          </motion.div>
          
          <motion.div 
            className="flex items-center gap-2"
            initial={{ opacity: 0, y: -20 }} 
            animate={{ opacity: 1, y: 0 }} 
            transition={{ duration: 0.3, delay: 0.1 }}
          >
            <button 
              className="btn-ghost" 
              onClick={() => setUnits(u => u === 'imperial' ? 'metric' : 'imperial')} 
              aria-label="Toggle temperature units"
            >
              <Thermometer className="w-4 h-4" /> 
              {units === 'imperial' ? '°F' : '°C'}
            </button>
            <button 
              className="btn-ghost" 
              onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')} 
              aria-label="Toggle theme"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4"/> : <Moon className="w-4 h-4"/>}
              {theme === 'dark' ? 'Light' : 'Dark'}
            </button>
          </motion.div>
        </div>

        {/* Search Bar */}
        <motion.div 
          className="card mb-6"
          initial={{ opacity: 0, y: 20 }} 
          animate={{ opacity: 1, y: 0 }} 
          transition={{ duration: 0.3, delay: 0.2 }}
        >
          <div className="flex items-center gap-3">
            <input 
              className="input flex-1" 
              placeholder="Search city (e.g., Minneapolis, London, Tokyo)" 
              value={q} 
              onChange={e => setQ(e.target.value)} 
              onKeyDown={handleKeyPress}
              aria-label="Search city" 
              disabled={loading}
            />
            <button 
              className="btn" 
              onClick={handleSearch}
              disabled={loading || !q.trim()}
              aria-label="Search weather"
            >
              {loading ? (
                <div className="spinner" />
              ) : (
                <Search className="w-4 h-4"/>
              )}
              Search
            </button>
          </div>
          
          {recent.length > 0 && (
            <div className="mt-4">
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">Recent searches:</p>
              <div className="flex flex-wrap gap-2">
                {recent.map(c => (
                  <span 
                    key={c} 
                    className="chip" 
                    onClick={() => { setQ(c); runSearch(c) }}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        setQ(c)
                        runSearch(c)
                      }
                    }}
                  >
                    <MapPin className="w-3 h-3"/> {c}
                  </span>
                ))}
              </div>
            </div>
          )}
        </motion.div>

        {/* Error State */}
        {error && (
          <motion.div 
            className="card border border-rose-300/50 mb-6"
            initial={{ opacity: 0, scale: 0.95 }} 
            animate={{ opacity: 1, scale: 1 }} 
            transition={{ duration: 0.2 }}
          >
            <p className="text-rose-600 dark:text-rose-400 flex items-center gap-2">
              <span className="text-lg">⚠️</span>
              {error}
            </p>
          </motion.div>
        )}

        {/* Loading State */}
        {loading && (
          <motion.div 
            className="card flex items-center gap-3 mb-6"
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            transition={{ duration: 0.2 }}
          >
            <div className="spinner" />
            <p className="text-slate-600 dark:text-slate-300">Loading weather data...</p>
          </motion.div>
        )}

        {/* Weather Content */}
        {!loading && now && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }} 
            animate={{ opacity: 1, y: 0 }} 
            transition={{ duration: 0.3 }} 
            className="grid lg:grid-cols-3 gap-6"
          >
            {/* Current Weather Card */}
            <div className="card lg:col-span-1">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                    <MapPin className="w-5 h-5" />
                    {now.name}, {now.sys.country}
                  </h2>
                  <p className="text-slate-600 dark:text-slate-300 capitalize">
                    {now.weather[0].description}
                  </p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    {new Date().toLocaleDateString(undefined, { 
                      weekday: 'long', 
                      year: 'numeric', 
                      month: 'long', 
                      day: 'numeric' 
                    })}
                  </p>
                </div>
                <img 
                  src={`https://openweathermap.org/img/wn/${now.weather[0].icon}@2x.png`} 
                  alt={now.weather[0].description} 
                  className="w-16 h-16 weather-icon"
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4 items-center">
                <div>
                  <div className="temp-display font-bold text-slate-900 dark:text-white">
                    {Math.round(now.main.temp)}{unitLabel}
                  </div>
                  <div className="text-slate-500 dark:text-slate-400">
                    Feels like {Math.round(now.main.feels_like)}{unitLabel}
                  </div>
                  <div className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                    H: {Math.round(now.main.temp_max)}{unitLabel} L: {Math.round(now.main.temp_min)}{unitLabel}
                  </div>
                </div>
                
                <div className="grid gap-3 text-sm text-slate-600 dark:text-slate-300">
                  <div className="flex items-center gap-2">
                    <Droplets className="w-4 h-4 text-blue-500" /> 
                    Humidity {now.main.humidity}%
                  </div>
                  <div className="flex items-center gap-2">
                    <Wind className="w-4 h-4 text-cyan-500" /> 
                    {Math.round(now.wind.speed)} {speedUnit(units)} {degToCompass(now.wind.deg)}
                  </div>
                  <div className="flex items-center gap-2">
                    <Eye className="w-4 h-4 text-slate-500" /> 
                    {(now.visibility / 1000).toFixed(1)} km
                  </div>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-slate-200/60 dark:border-slate-700/60">
                <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                  <Sunrise className="w-4 h-4 text-amber-500" />
                  <div>
                    <div className="font-medium">Sunrise</div>
                    <div>{formatTime(now.sys.sunrise)}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                  <Sunset className="w-4 h-4 text-orange-500" />
                  <div>
                    <div className="font-medium">Sunset</div>
                    <div>{formatTime(now.sys.sunset)}</div>
                  </div>
                </div>
              </div>
            </div>

            {/* 5-Day Forecast Card */}
            <div className="card lg:col-span-2">
              <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-4 flex items-center gap-2">
                <Thermometer className="w-5 h-5" />
                5-Day Forecast
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                {fc?.map((d, index) => {
                  const date = new Date(d.dt * 1000)
                  const day = index === 0 ? 'Today' : date.toLocaleDateString(undefined, { weekday: 'short' })
                  const dayFull = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
                  
                  return (
                    <motion.div 
                      key={d.dt} 
                      className="forecast-card"
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.2, delay: index * 0.1 }}
                    >
                      <div className="text-sm font-medium text-slate-700 dark:text-slate-300">
                        {day}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 mb-2">
                        {dayFull}
                      </div>
                      <img 
                        className="mx-auto w-12 h-12 weather-icon" 
                        src={`https://openweathermap.org/img/wn/${d.weather[0].icon}@2x.png`} 
                        alt={d.weather[0].description} 
                      />
                      <div className="text-base font-semibold text-slate-800 dark:text-slate-100 mt-2">
                        {Math.round(d.main.temp)}{unitLabel}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-300 capitalize mt-1">
                        {d.weather[0].main}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex items-center justify-center gap-1">
                        <Droplets className="w-3 h-3" />
                        {d.main.humidity}%
                      </div>
                    </motion.div>
                  )
                })}
              </div>
            </div>
          </motion.div>
        )}

        {/* Footer */}
        <motion.footer 
          className="mt-12 text-center"
          initial={{ opacity: 0 }} 
          animate={{ opacity: 1 }} 
          transition={{ duration: 0.3, delay: 0.5 }}
        >
          <div className="text-xs text-slate-500 dark:text-slate-400 space-y-1">
            <div>Built with OpenWeatherMap API • React + TypeScript + Tailwind CSS</div>
            <div>Units: {units === 'imperial' ? '°F / mph' : '°C / m/s'} • Theme: {theme} mode</div>
          </div>
        </motion.footer>
      </div>
    </div>
  )
}