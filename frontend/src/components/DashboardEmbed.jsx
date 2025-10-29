import React, { useEffect, useRef, useState } from 'react'
import axios from 'axios'
import { DatabricksDashboard } from '@databricks/aibi-client'

/**
 * DashboardEmbed Component
 * 
 * Handles the embedding of Databricks dashboards using the official
 * @databricks/aibi-client SDK. This component:
 * 
 * 1. Imports the Databricks SDK from CDN
 * 2. Initializes the dashboard with provided configuration
 * 3. Manages the dashboard lifecycle (mount/unmount)
 * 4. Handles automatic token refresh for seamless long-running sessions
 * 5. Handles errors gracefully
 * 
 * @param {Object} config - Dashboard configuration from backend
 * @param {string} config.workspace_url - Databricks workspace URL
 * @param {string} config.workspace_id - Workspace ID
 * @param {string} config.dashboard_id - Dashboard ID
 * @param {string} config.embed_token - OAuth token for authentication
 * @param {Object} config.user_context - Current user information
 * @param {Function} onError - Callback for error handling
 */
const DashboardEmbed = ({ config, onError }) => {
  const containerRef = useRef(null)
  const [loading, setLoading] = useState(true)
  const dashboardInstance = useRef(null)

  useEffect(() => {
    if (!config || !containerRef.current) return

    let mounted = true

    const initializeDashboard = async () => {
      try {
        setLoading(true)

        // Check if component is still mounted
        if (!mounted) return

        // Clear any existing content
        if (containerRef.current) {
          containerRef.current.innerHTML = ''
        }

            // Initialize the dashboard using the imported SDK
        // with automatic token refresh for seamless long-running sessions
        dashboardInstance.current = new DatabricksDashboard({
          instanceUrl: config.workspace_url,
          workspaceId: config.workspace_id,
          dashboardId: config.dashboard_id,
          token: config.embed_token,
          container: containerRef.current,
          
          // Automatic token refresh callback
          // SDK calls this when token is close to expiration
          getNewToken: async () => {
            try {
              console.log('Token expiring, fetching fresh token...')
              const response = await axios.get('/api/dashboard/embed-config', {
                withCredentials: true
              })
              console.log('Fresh token obtained successfully')
              return response.data.embed_token
            } catch (err) {
              console.error('Failed to refresh token:', err)
              throw err
            }
          }
        })

        // Initialize and render the dashboard
        await dashboardInstance.current.initialize()
        
        setLoading(false)
        console.log('Dashboard initialized for user:', config.user_context?.name)
        
      } catch (err) {
        console.error('Error initializing dashboard:', err)
        setLoading(false)
        
        if (onError) {
          onError(`Failed to load dashboard: ${err.message}`)
        }
      }
    }

    initializeDashboard()

    // Cleanup function
    return () => {
      mounted = false
      
      // Clean up dashboard instance if it exists
      if (dashboardInstance.current && typeof dashboardInstance.current.destroy === 'function') {
        dashboardInstance.current.destroy()
      }
      
      // Clear container
      if (containerRef.current) {
        containerRef.current.innerHTML = ''
      }
    }
  }, [config, onError])

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      {loading && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          color: '#666',
          fontSize: '14px'
        }}>
          Loading dashboard...
        </div>
      )}
      <div 
        ref={containerRef} 
        style={{ width: '100%', height: '100%' }}
      />
    </div>
  )
}

export default DashboardEmbed

