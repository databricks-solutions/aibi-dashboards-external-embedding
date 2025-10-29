import React, { useState, useEffect } from 'react'
import axios from 'axios'
import DashboardEmbed from './components/DashboardEmbed'
import './App.css'

/**
 * Main application component for AI/BI External Embedding
 * 
 * Handles:
 * - User authentication (login/logout)
 * - Fetching dashboard configuration and OAuth tokens from backend
 * - Rendering the DashboardEmbed component with user-specific tokens
 * - User switching to demonstrate row-level security
 */
const App = () => {
  const [currentUser, setCurrentUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [dashboardConfig, setDashboardConfig] = useState(null)

  // Dummy users available for switching
  const AVAILABLE_USERS = [
    { username: 'alice', name: 'Alice Johnson', department: 'Sales' },
    { username: 'bob', name: 'Bob Smith', department: 'Engineering' }
  ]

  // Check if user is already logged in
  useEffect(() => {
    checkCurrentUser()
  }, [])

  /**
   * Check if user is already authenticated
   */
  const checkCurrentUser = async () => {
    try {
      const response = await axios.get('/api/auth/current-user', {
        withCredentials: true
      })
      setCurrentUser(response.data)
      await fetchDashboardConfig()
    } catch (err) {
      // User not logged in, that's okay
      setLoading(false)
    }
  }

  /**
   * Login with username (simplified for demo)
   */
  const handleLogin = async (username) => {
    setLoading(true)
    setError(null)

    try {
      const response = await axios.post(
        '/api/auth/login',
        { username: username },
        { withCredentials: true }
      )

      setCurrentUser(response.data.user)
      await fetchDashboardConfig()
    } catch (err) {
      setError('Login failed. Please try again.')
      console.error('Login error:', err)
    } finally {
      setLoading(false)
    }
  }

  /**
   * Logout current user
   */
  const handleLogout = async () => {
    try {
      await axios.post('/api/auth/logout', {}, { withCredentials: true })
      setCurrentUser(null)
      setDashboardConfig(null)
      setLoading(false)  // Reset loading state
      setError(null)     // Clear any errors
    } catch (err) {
      console.error('Logout error:', err)
      setLoading(false)  // Reset loading even on error
    }
  }

  /**
   * Switch to a different user (for demo purposes)
   */
  const handleUserSwitch = async (username) => {
    await handleLogout()
    await handleLogin(username)
  }

  /**
   * Fetch dashboard embedding configuration from backend
   * This includes the OAuth token minted for the current user
   */
  const fetchDashboardConfig = async () => {
    setLoading(true)
    setError(null)

    try {
      const response = await axios.get('/api/dashboard/embed-config', {
        withCredentials: true
      })
      setDashboardConfig(response.data)
    } catch (err) {
      setError('Failed to load dashboard configuration.')
      console.error('Dashboard config error:', err)
    } finally {
      setLoading(false)
    }
  }


  // Render loading state
  if (loading && !currentUser) {
    return (
      <div className="app">
        <div className="loading">Loading...</div>
      </div>
    )
  }

  // Render login screen if no user is authenticated
  if (!currentUser) {
    return (
      <div className="app">
        <div className="login-container">
          <h1>AI/BI External Embedding</h1>
          <p>Select a user to login:</p>
          <div className="user-selection">
            {AVAILABLE_USERS.map(user => (
              <button
                key={user.username}
                onClick={() => handleLogin(user.username)}
                className="user-button"
              >
                <div className="user-name">{user.name}</div>
                <div className="user-dept">{user.department}</div>
              </button>
            ))}
          </div>
          {error && <div className="error">{error}</div>}
        </div>
      </div>
    )
  }

  // Render main dashboard view
  return (
    <div className="app">
      {/* Header with user info and controls */}
      <header className="header">
        <div className="header-content">
          <h1>AI/BI External Embedding</h1>
          
          <div className="user-info">
            <div className="current-user">
              <strong>{currentUser.name}</strong>
              <span className="user-department">{currentUser.department}</span>
            </div>
            
            <div className="user-actions">
              {/* Switch user dropdown */}
              <select
                onChange={(e) => handleUserSwitch(e.target.value)}
                value=""
                className="user-switch"
              >
                <option value="" disabled>Switch User</option>
                {AVAILABLE_USERS
                  .filter(u => u.username !== currentUser.email.split('@')[0])
                  .map(user => (
                    <option key={user.username} value={user.username}>
                      {user.name} ({user.department})
                    </option>
                  ))
                }
              </select>
              
              <button onClick={handleLogout} className="logout-button">
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Dashboard embedding container */}
      <main className="dashboard-container">
        {error && <div className="error">{error}</div>}
        
        {dashboardConfig && (
          <div className="dashboard-info">
            <small>
              Viewing dashboard: {dashboardConfig.dashboard_id} | 
              User context: {dashboardConfig.user_context.email}
            </small>
          </div>
        )}
        
        {/* Databricks dashboard embedded via DashboardEmbed component */}
        <div className="dashboard-embed">
          <DashboardEmbed 
            config={dashboardConfig}
            onError={setError}
          />
        </div>
      </main>
    </div>
  )
}

export default App

