# AI/BI External Embedding Template

A minimal template showing how to embed Databricks dashboards into external applications with user authentication and row-level security.

<img src="img/Dashboard Page.png" width="600">


## 📋 What This Template Shows

1. **Backend (Flask)**: Authenticate users and [generate user-specific Databricks OAuth tokens](https://docs.databricks.com/aws/en/dashboards/embedding/external-embed#gsc.tab=0)
2. **Frontend (React)**: Use the [Databricks embedding SDK](https://www.npmjs.com/package/@databricks/aibi-client) to display dashboards
3. **Row-Level Security**: Pass user context for data filtering with `__aibi_external_value`

## Project Structure

```
aibi-external-embedding/
│
├── backend/                          # Flask Backend
│   ├── app.py                       # Main application - START HERE
│   ├── requirements.txt             # Python dependencies
│   └── .env.example                 # Configuration template
│
└── frontend/                         # React Frontend
    ├── src/
    │   ├── components/
    │   │   └── DashboardEmbed.jsx  # Dashboard embedding component
    │   ├── App.jsx                  # Main React component - START HERE
    │   ├── App.css                  # Styles
    │   ├── main.jsx                 # Entry point
    │   └── index.css                # Global styles
    ├── index.html                   # HTML template
    ├── package.json                 # Node dependencies
    └── vite.config.js               # Dev server config
```

## How It Works: File Relationships

### 1. User Logs In

<img src="img/Login Page.png" width="600">


**Frontend** (`frontend/src/App.jsx`)
```javascript
// User clicks login → sends username to backend
const handleLogin = async (username) => {
  await axios.post('/api/auth/login', { username: username })
}
```

**Backend** (`backend/app.py`)
```python
@app.route('/api/auth/login', methods=['POST'])
def login():
    # Validates username
    # Creates user session
    session['user_id'] = user['id']
    return jsonify({'user': user})
```

### 2. Frontend Requests Dashboard Configuration

**Frontend** (`frontend/src/App.jsx`)
```javascript
// After login, request dashboard config and token
const fetchDashboardConfig = async () => {
  const response = await axios.get('/api/dashboard/embed-config')
  // Response includes: workspace_url, dashboard_id, embed_token
  setDashboardConfig(response.data)
}
```

**Backend** (`backend/app.py`)
```python
@app.route('/api/dashboard/embed-config')
@login_required
def get_embed_config():
    # Gets current user from session
    user = DUMMY_USERS.get(session['username'])
    
    # Mints OAuth token for this specific user
    token_data = mint_databricks_token(user)
    
    # Returns dashboard config + token to frontend
    return jsonify({
        'workspace_url': os.environ.get('DATABRICKS_WORKSPACE_URL'),
        'dashboard_id': os.environ.get('DATABRICKS_DASHBOARD_ID'),
        'embed_token': token_data['access_token'],
        'user_context': user
    })
```

### 3. Token Minting (Key Function)

**Backend** (`backend/app.py`)
```python
def mint_databricks_token(user_data):
    """
    Creates an OAuth token for the authenticated user using 
    the official Databricks 3-step token generation process.
    
    Steps:
    1. Get all-apis token from OIDC endpoint
    2. Get token info for the dashboard with external viewer context
    3. Generate scoped token with authorization details
    
    The user context (external_viewer_id and external_value) enables 
    row-level security in your dashboards.
    """
    # Step 1: Get all-apis token
    oidc_response = requests.post(
        f"{workspace_url}/oidc/v1/token",
        data={"grant_type": "client_credentials", "scope": "all-apis"}
    )
    
    # Step 2: Get token info with user context
    token_info_response = requests.get(
        f"{workspace_url}/api/2.0/lakeview/dashboards/{dashboard_id}/published/tokeninfo"
        f"?external_viewer_id={user_data['email']}"
        f"&external_value={user_data['department']}"
    )
    
    # Step 3: Generate scoped token
    scoped_response = requests.post(
        f"{workspace_url}/oidc/v1/token",
        data={
            "grant_type": "client_credentials",
            "authorization_details": json.dumps(authorization_details)
        }
    )
    
    return scoped_response.json()['access_token']
```

### 4. Dashboard Embedding

**Frontend** (`frontend/src/components/DashboardEmbed.jsx`)
```javascript
import { DatabricksDashboard } from '@databricks/aibi-client'

// Initialize dashboard with automatic token refresh
const dashboard = new DatabricksDashboard({
  instanceUrl: config.workspace_url,
  workspaceId: config.workspace_id,
  dashboardId: config.dashboard_id,
  token: config.embed_token,
  container: containerRef.current,
  
  // SDK calls this callback ~5 min before token expires
  getNewToken: async () => {
    const response = await axios.get('/api/dashboard/embed-config')
    return response.data.embed_token
  }
})

await dashboard.initialize()
```

## 👥 Demo Users

| Username | Department | Purpose |
|----------|-----------|---------|
| `alice` | Sales | See sales data |
| `bob` | Engineering | See engineering data |

## 🚀 Getting Started

**Prerequisites:** Python 3.9+, Node.js 16+, npm

### Step 1: Clone the Repository

```bash
git clone https://github.com/databricks-solutions/aibi-dashboards-external-embedding.git
cd aibi-dashboards-external-embedding
```

### Step 2: Install Requirements in Virtual Environment

**Backend:**
```bash
cd backend
python3 -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
cd ..
```

**Frontend:**
```bash
cd frontend
npm install
cd ..
```

### Step 3: Create and Configure `.env` File

**Create the file:**
```bash
cd backend
cp .env.example .env  # Windows: copy .env.example .env
```

**Get the required values:**

1. **DATABRICKS_WORKSPACE_URL**: Your workspace URL (e.g., `https://your-workspace.cloud.databricks.com`)
   - Copy from your browser address bar when logged into Databricks

2. **DATABRICKS_CLIENT_ID & DATABRICKS_CLIENT_SECRET**: Service Principal credentials
   - Go to **Settings** → **Identity and Access** → **Service Principals**
   - Click **Add Service Principal** → Name it (e.g., "Dashboard Embedding SP")
   - Click **Generate Secret** → Save the Client ID and Client Secret (you won't see the secret again)

3. **DATABRICKS_DASHBOARD_ID**: Your dashboard's unique ID
   - Open your dashboard in Databricks (make sure it is published)
   - Copy the ID from the URL: `https://your-workspace.cloud.databricks.com/sql/dashboards/{DASHBOARD_ID}`

4. **DATABRICKS_WORKSPACE_ID**: Your workspace's numeric ID
   - See official docs: [AWS](https://docs.databricks.com/aws/en/workspace/workspace-details) | [Azure](https://learn.microsoft.com/en-us/azure/databricks/workspace/workspace-details) | [GCP](https://docs.databricks.com/gcp/en/workspace/workspace-details)

**Edit `backend/.env`:**
```env
DATABRICKS_WORKSPACE_URL=https://your-workspace.cloud.databricks.com
DATABRICKS_CLIENT_ID=your-service-principal-client-id
DATABRICKS_CLIENT_SECRET=your-service-principal-secret
DATABRICKS_DASHBOARD_ID=your-dashboard-id
DATABRICKS_WORKSPACE_ID=your-workspace-id
```

**Grant permissions to Service Principal:**

1. **Dashboard Access:**
   - Open your dashboard → Click **Share** → Add Service Principal with **Can View** permission

2. **SQL Warehouse Access:**
   - Go to **SQL Warehouses** → Select your warehouse → Click **Permissions**
   - Add Service Principal with **Can Use** permission

3. **Unity Catalog Data Access:**
   - Go to **Data Explorer** → Navigate to your catalog, schema, and tables used in the dashboard
   - For each level (catalog → schema → table), click **Permissions** tab → Add Service Principal with appropriate access

### Step 4: Customize for Your Dashboard

This demo uses `department` for row-level security. Customize it for your data:

**A. Update the backend** (`backend/app.py`):

```python
# Change the DUMMY_USERS to match your data attribute
DUMMY_USERS = {
    'alice': {
        'id': 'user_alice',
        'name': 'Alice Johnson',
        'email': 'alice@example.com',
        'region': 'US-West'  # Changed from 'department' to 'region'
    },
    'bob': {
        'id': 'user_bob',
        'name': 'Bob Smith',
        'email': 'bob@example.com',
        'region': 'US-East'  # Changed from 'department' to 'region'
    }
}
```

Find this line in `mint_databricks_token()` function (~line 94):
```python
f"&external_value={user_data['department']}"
```

Change to:
```python
f"&external_value={user_data['region']}"  # Or whatever attribute you're using
```

**B. Update your dashboard SQL:**

Add a `WHERE` clause using `__aibi_external_value`:

```sql
SELECT * FROM your_table
WHERE region = __aibi_external_value  -- Filters based on user's attribute
```

### Step 5: Start the Servers

**Terminal 1 - Backend:**
```bash
cd backend
source venv/bin/activate  # Windows: venv\Scripts\activate
python app.py
# Should show: Running on http://127.0.0.1:5000
```

**Terminal 2 - Frontend:**
```bash
cd frontend
npm run dev
# Should show: Local: http://localhost:3000/
```

**Access:** Open http://localhost:3000 and login as `alice` or `bob`



## Understanding the Flow

```
┌─────────────┐         ┌─────────────┐         ┌─────────────┐
│   Browser   │         │    Flask    │         │ Databricks  │
│  (React)    │         │   Backend   │         │             │
└─────────────┘         └─────────────┘         └─────────────┘
      │                       │                       │
      │  1. Login (alice)     │                       │
      │──────────────────────>│                       │
      │                       │                       │
      │  2. Session created   │                       │
      │<──────────────────────│                       │
      │                       │                       │
      │  3. Get dashboard     │                       │
      │     config & token    │                       │
      │──────────────────────>│                       │
      │                       │                       │
      │                       │  4. Mint OAuth token  │
      │                       │     for Alice         │
      │                       │──────────────────────>│
      │                       │                       │
      │                       │  5. Return token      │
      │                       │<──────────────────────│
      │                       │                       │
      │  6. Config + token    │                       │
      │<──────────────────────│                       │
      │                       │                       │
      │  7. Embed dashboard   │                       │
      │     with Alice's      │                       │
      │     token in iframe   │                       │
      │──────────────────────────────────────────────>│
      │                       │                       │
      │  8. Dashboard renders │                       │
      │     with Alice's data │                       │
      │<──────────────────────────────────────────────│
```

## ❓ Common Questions

**Q: Where is the OAuth token generated?**  
A: In `backend/app.py`, function `mint_databricks_token()` (line 55) uses the 3-step OAuth flow to generate user-specific tokens.

**Q: How does the frontend get the token?**  
A: The frontend calls `/api/dashboard/embed-config` which returns the dashboard configuration and a fresh OAuth token (line 216 in `app.py`).

**Q: How is the dashboard embedded?**  
A: Using the `@databricks/aibi-client` SDK in `frontend/src/components/DashboardEmbed.jsx`. The SDK handles embedding, rendering, and automatic token refresh.

**Q: How does row-level security (RLS) work?**  
A: The backend passes user context (`external_viewer_id` and `external_value`) when minting tokens:
```python
# In mint_databricks_token() - passes department as external_value
token_info_url = (
    f"{workspace_url}/api/2.0/lakeview/dashboards/{dashboard_id}/published/tokeninfo"
    f"?external_viewer_id={user_data['email']}"
    f"&external_value={user_data['department']}"  # e.g., "Sales"
)
```

In your Databricks dashboard SQL queries, use `__aibi_external_value` to filter data:
```sql
SELECT * FROM sales_data
WHERE department = __aibi_external_value  -- Returns "Sales" for Alice, "Engineering" for Bob
```

**Q: How do I customize this for my own dashboard?**  
A: See [Step 4: Customize for Your Dashboard](#step-4-customize-for-your-dashboard). You'll need to:
1. Update `DUMMY_USERS` in `backend/app.py` with your data attribute (e.g., change `department` to `region`)
2. Update the `external_value` parameter in `mint_databricks_token()`
3. Add `WHERE your_column = __aibi_external_value` to your dashboard SQL queries

**Q: What files should I read first?**  
A: Start with:
- `backend/app.py` - Token minting, authentication, RLS
- `frontend/src/App.jsx` - Login flow and user management
- `frontend/src/components/DashboardEmbed.jsx` - Dashboard SDK integration
- `backend/.env.example` - Required configuration

## Key Dependencies

### Frontend
- **[@databricks/aibi-client](https://www.npmjs.com/package/@databricks/aibi-client)** (v1.0.0) - Official Databricks SDK for dashboard embedding
- **React** (v18.2.0) - UI framework
- **Axios** (v1.6.0) - HTTP client for API calls
- **Vite** (v5.0.0) - Build tool and dev server

### Backend
- **Flask** (v3.0.0) - Python web framework
- **Flask-CORS** (v4.0.0) - CORS support for frontend communication
- **python-dotenv** (v1.0.0) - Environment variable management
- **requests** (v2.31.0) - HTTP library for Databricks OAuth API calls

## Next Steps

1. Examine the code to understand the flow
2. Customize for your use case
3. Check the [Databricks AI/BI External Embedding](https://docs.databricks.com/aws/en/dashboards/embedding/external-embed#gsc.tab=0) and [Databricks SDK](https://www.npmjs.com/package/@databricks/aibi-client) documentation for more details.

## How to get help

Databricks support doesn't cover this content. For questions or bugs, please open a GitHub issue and the team will help on a best effort basis.


## License

&copy; 2025 Databricks, Inc. All rights reserved. The source in this notebook is provided subject to the Databricks License [https://databricks.com/db-license-source]. All included or referenced third party libraries are subject to the licenses set forth below.

| Library | Description | License | Source |
|---------|-------------|---------|--------|
| [@databricks/aibi-client](https://www.npmjs.com/package/@databricks/aibi-client) | Official Databricks SDK for dashboard embedding | Proprietary | https://www.npmjs.com/package/@databricks/aibi-client |
| [React](https://reactjs.org/) | JavaScript library for building user interfaces | MIT | https://github.com/facebook/react |
| [Axios](https://axios-http.com/) | Promise-based HTTP client | MIT | https://github.com/axios/axios |
| [Vite](https://vitejs.dev/) | Frontend build tool and dev server | MIT | https://github.com/vitejs/vite |
| [Flask](https://flask.palletsprojects.com/) | Python web framework | BSD-3-Clause | https://github.com/pallets/flask |
| [Flask-CORS](https://flask-cors.readthedocs.io/) | Cross-origin resource sharing for Flask | MIT | https://github.com/corydolphin/flask-cors |
| [python-dotenv](https://github.com/theskumar/python-dotenv) | Environment variable management | BSD-3-Clause | https://github.com/theskumar/python-dotenv |
| [requests](https://requests.readthedocs.io/) | HTTP library for Python | Apache-2.0 | https://github.com/psf/requests |
