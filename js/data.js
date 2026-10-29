/**
 * BuildTrack - Construction Project Management & Risk Prediction System
 * Data Store & Initial Dataset (Realistic Construction Management Data for India)
 */

(function () {
  'use strict';

  const STORAGE_KEYS = {
    PROJECTS: 'buildtrack_projects',
    TASKS: 'buildtrack_tasks',
    LABOUR: 'buildtrack_labour',
    MATERIALS: 'buildtrack_materials',
    EXPENSES: 'buildtrack_expenses',
    PAYMENTS: 'buildtrack_payments',
    PROGRESS: 'buildtrack_progress',
    SETTINGS: 'buildtrack_settings',
    CURRENT_USER: 'buildtrack_current_user',
    INITIALIZED: 'buildtrack_initialized_v2'
  };

  // Seed Data: 5 Realistic Projects in India
  const initialProjects = [
    {
      id: 'PRJ-01',
      name: 'Apex Heights Commercial Tower',
      client: 'Brigade Tech Spaces Ltd',
      location: 'Whitefield, Bengaluru, Karnataka',
      manager: 'Er. Rajesh Kumar',
      startDate: '2026-02-15',
      expectedCompletionDate: '2026-12-30',
      budget: 8500000,
      spent: 6120000,
      progress: 72,
      status: 'ongoing',
      description: '12-storey commercial office complex with double basement car parking, grade M35 concrete structural frame, and LEED Gold energy-efficient envelope.'
    },
    {
      id: 'PRJ-02',
      name: 'Greenfield Villa Enclave',
      client: 'Emerald Bay Developers',
      location: 'East Coast Road (ECR), Chennai, Tamil Nadu',
      manager: 'Er. S. Ananth',
      startDate: '2026-01-10',
      expectedCompletionDate: '2026-11-20',
      budget: 4500000,
      spent: 3960000,
      progress: 88,
      status: 'ongoing',
      description: 'Gated community of 8 luxury sea-facing duplex villas with RCC column-beam framework, teakwood carpentry, and Italian marble flooring.'
    },
    {
      id: 'PRJ-03',
      name: 'Metro Flyover Pier Extension',
      client: 'Urban Infra Development Corp',
      location: 'Andheri East, Mumbai, Maharashtra',
      manager: 'Er. Vikram Shinde',
      startDate: '2025-11-01',
      expectedCompletionDate: '2026-10-15',
      budget: 15000000,
      spent: 14250000,
      progress: 64,
      status: 'delayed',
      description: 'Civil substructure, deep pile foundations, pier casting and prestressed box girders for 2.4 km elevated urban expressway link.'
    },
    {
      id: 'PRJ-04',
      name: 'Sunrise Valley Apartments',
      client: 'Deccan Urban Homes',
      location: 'Gachibowli, Hyderabad, Telangana',
      manager: 'Er. K. V. Rao',
      startDate: '2026-05-01',
      expectedCompletionDate: '2027-04-30',
      budget: 9500000,
      spent: 3325000,
      progress: 35,
      status: 'ongoing',
      description: 'G+14 residential apartment tower. Raft foundation and basement completed; 5th-floor slab shuttering and rebar binding ongoing.'
    },
    {
      id: 'PRJ-05',
      name: 'Zenith Smart Logistics Hub',
      client: 'TVS Industrial & Logistics',
      location: 'SIPCOT Industrial Park, Hosur, Tamil Nadu',
      manager: 'Er. M. Praveen',
      startDate: '2025-09-01',
      expectedCompletionDate: '2026-08-30',
      budget: 3800000,
      spent: 3740000,
      progress: 100,
      status: 'completed',
      description: 'Pre-engineered industrial warehouse facility (50,000 sq ft) with heavy-duty laser-screed concrete flooring, solar PV array, and dock levelers.'
    }
  ];

  // Seed Data: Tasks & Schedule
  const initialTasks = [
    {
      id: 'TSK-101',
      projectId: 'PRJ-01',
      title: 'RCC Column Casting - Floor 9',
      description: 'Erect formwork, inspect 16mm rebar cage ties, and pour M35 grade ready-mix concrete.',
      assignedTo: 'Ramesh Patel (Mason Team)',
      startDate: '2026-10-20',
      dueDate: '2026-10-30',
      priority: 'high',
      status: 'in-progress'
    },
    {
      id: 'TSK-102',
      projectId: 'PRJ-01',
      title: 'HVAC Ducting & Fire Sprinkler Risers',
      description: 'Install galvanized sheet ducting on Floor 6 and pressure test wet riser sprinkler lines.',
      assignedTo: 'Abdul Karim (HVAC Team)',
      startDate: '2026-10-15',
      dueDate: '2026-11-05',
      priority: 'medium',
      status: 'in-progress'
    },
    {
      id: 'TSK-103',
      projectId: 'PRJ-01',
      title: 'Lift Well Scaffolding & Plumb Inspection',
      description: 'Verify vertical alignment and install guide rail brackets for dual passenger elevators.',
      assignedTo: 'Govind Shinde (Fabricator)',
      startDate: '2026-10-05',
      dueDate: '2026-10-22',
      priority: 'high',
      status: 'in-progress' // Overdue
    },
    {
      id: 'TSK-104',
      projectId: 'PRJ-01',
      title: 'Basement Anti-Efflorescence & Waterproofing',
      description: 'Apply Dr. Fixit crystalline slurry coating to cold joints and retaining wall perimeter.',
      assignedTo: 'Chotelal Maurya (Specialist)',
      startDate: '2026-09-25',
      dueDate: '2026-10-10',
      priority: 'medium',
      status: 'completed'
    },
    {
      id: 'TSK-105',
      projectId: 'PRJ-02',
      title: 'Villa 3 & 4 Italian Marble Honing & Polishing',
      description: '5-stage diamond abrasive floor grinding, epoxy grouting, and mirror gloss buffing.',
      assignedTo: 'Lakshmi Narayana (Finishing)',
      startDate: '2026-10-18',
      dueDate: '2026-11-02',
      priority: 'medium',
      status: 'in-progress'
    },
    {
      id: 'TSK-106',
      projectId: 'PRJ-02',
      title: 'Perimeter Boundary Wall & Smart Boom Barrier',
      description: 'Masonry coping, automated sliding gate motor assembly and intercom conduit integration.',
      assignedTo: 'Suresh Verma (Carpentry)',
      startDate: '2026-10-25',
      dueDate: '2026-11-12',
      priority: 'low',
      status: 'todo'
    },
    {
      id: 'TSK-107',
      projectId: 'PRJ-02',
      title: 'External Weather-Coat Silicone Emulsion',
      description: 'Two coats of Asian Paints Apex Ultima exterior emulsion on boundary parapets.',
      assignedTo: 'Lakshmi Narayana (Finishing)',
      startDate: '2026-10-01',
      dueDate: '2026-10-18',
      priority: 'low',
      status: 'completed'
    },
    {
      id: 'TSK-108',
      projectId: 'PRJ-03',
      title: 'Pier P-14 Pier Cap Concrete Pour',
      description: 'Critical heavy structural casting. Requires 62 Cu.M M45 concrete and synchronized vibrators.',
      assignedTo: 'Manjunath Gowda (Civil)',
      startDate: '2026-10-05',
      dueDate: '2026-10-19',
      priority: 'high',
      status: 'in-progress' // Overdue
    },
    {
      id: 'TSK-109',
      projectId: 'PRJ-03',
      title: 'Prestressed Girder Launching Traffic Clearance',
      description: 'Obtain night-time road closure approval from Mumbai Traffic Police for spans 12-13.',
      assignedTo: 'Er. Vikram Shinde (Liaison)',
      startDate: '2026-09-28',
      dueDate: '2026-10-14',
      priority: 'high',
      status: 'todo' // Overdue
    },
    {
      id: 'TSK-110',
      projectId: 'PRJ-03',
      title: 'Deep Pile Load Deflection Testing',
      description: 'Hydraulic jack static vertical load test up to 1.5x design capacity for Pier P-16.',
      assignedTo: 'Santosh Yadav (Testing)',
      startDate: '2026-09-10',
      dueDate: '2026-09-24',
      priority: 'high',
      status: 'completed'
    },
    {
      id: 'TSK-111',
      projectId: 'PRJ-04',
      title: '5th Floor Slab Rebar Tying & Conduiting',
      description: 'Lay bottom mat 10mm high-yield TMT bars, install fan hooks and PVC electrical pipe runs.',
      assignedTo: 'Manjunath Gowda (Bar Benders)',
      startDate: '2026-10-22',
      dueDate: '2026-11-04',
      priority: 'high',
      status: 'in-progress'
    },
    {
      id: 'TSK-112',
      projectId: 'PRJ-04',
      title: 'Plumbing Soil and Waste Risers (Shaft 2)',
      description: 'Install Supreme 110mm PVC multi-floor vertical drainage stacks with cleanout plugs.',
      assignedTo: 'Murugan K. (Plumbing)',
      startDate: '2026-10-26',
      dueDate: '2026-11-15',
      priority: 'medium',
      status: 'todo'
    },
    {
      id: 'TSK-113',
      projectId: 'PRJ-04',
      title: 'External Perimeter Soil Anti-Termite Treatment',
      description: 'Inject chlorpyrifos emulsion at 1-meter intervals along building plinth foundation.',
      assignedTo: 'Chotelal Maurya (Specialist)',
      startDate: '2026-10-02',
      dueDate: '2026-10-09',
      priority: 'low',
      status: 'completed'
    },
    {
      id: 'TSK-114',
      projectId: 'PRJ-05',
      title: 'Final Handover Snag Rectification',
      description: 'Seal joints on heavy forklift ramps and calibrate high-bay LED motion sensors.',
      assignedTo: 'Dinesh Kumar (Supervisor)',
      startDate: '2026-08-15',
      dueDate: '2026-08-25',
      priority: 'medium',
      status: 'completed'
    },
    {
      id: 'TSK-115',
      projectId: 'PRJ-05',
      title: 'State Fire Service NOC Final Certification',
      description: 'Conduct live sprinkler flow tests and submit hydraulic design verification report.',
      assignedTo: 'Er. M. Praveen',
      startDate: '2026-08-01',
      dueDate: '2026-08-20',
      priority: 'high',
      status: 'completed'
    }
  ];

  // Seed Data: Workforce & Labourers
  const initialLabour = [
    {
      id: 'WRK-101',
      name: 'Ramesh Patel',
      skill: 'Head Mason',
      phone: '+91 98452 31102',
      assignedProjectId: 'PRJ-01',
      dailyWage: 950,
      availability: 'On Site',
      status: 'active'
    },
    {
      id: 'WRK-102',
      name: 'Suresh Verma',
      skill: 'Shuttering Carpenter',
      phone: '+91 97110 44290',
      assignedProjectId: 'PRJ-01',
      dailyWage: 900,
      availability: 'On Site',
      status: 'active'
    },
    {
      id: 'WRK-103',
      name: 'Manjunath Gowda',
      skill: 'Lead Bar Bender / Rebar',
      phone: '+91 94481 88320',
      assignedProjectId: 'PRJ-03',
      dailyWage: 1050,
      availability: 'On Site',
      status: 'active'
    },
    {
      id: 'WRK-104',
      name: 'Abdul Karim',
      skill: 'Licensed Electrician',
      phone: '+91 98205 66712',
      assignedProjectId: 'PRJ-02',
      dailyWage: 1100,
      availability: 'On Site',
      status: 'active'
    },
    {
      id: 'WRK-105',
      name: 'Murugan K.',
      skill: 'Senior Plumber',
      phone: '+91 94432 99180',
      assignedProjectId: 'PRJ-02',
      dailyWage: 1050,
      availability: 'On Site',
      status: 'active'
    },
    {
      id: 'WRK-106',
      name: 'Dinesh Kumar',
      skill: 'Civil Site Supervisor',
      phone: '+91 99160 22345',
      assignedProjectId: 'PRJ-01',
      dailyWage: 1500,
      availability: 'On Site',
      status: 'active'
    },
    {
      id: 'WRK-107',
      name: 'Santosh Yadav',
      skill: 'Concrete Pump Operator',
      phone: '+91 98920 11983',
      assignedProjectId: 'PRJ-03',
      dailyWage: 1200,
      availability: 'On Site',
      status: 'active'
    },
    {
      id: 'WRK-108',
      name: 'Govind Shinde',
      skill: 'Structural Welder & Fabricator',
      phone: '+91 97632 77410',
      assignedProjectId: 'PRJ-03',
      dailyWage: 1150,
      availability: 'On Site',
      status: 'active'
    },
    {
      id: 'WRK-109',
      name: 'Bablu Paswan',
      skill: 'General Civil Helper',
      phone: '+91 88720 55109',
      assignedProjectId: 'PRJ-04',
      dailyWage: 650,
      availability: 'On Site',
      status: 'active'
    },
    {
      id: 'WRK-110',
      name: 'Rakesh Das',
      skill: 'Brickwork Mason',
      phone: '+91 81045 99201',
      assignedProjectId: 'PRJ-04',
      dailyWage: 950,
      availability: 'On Site',
      status: 'active'
    },
    {
      id: 'WRK-111',
      name: 'Lakshmi Narayana',
      skill: 'Specialist Tile & Paint Finisher',
      phone: '+91 99401 22894',
      assignedProjectId: 'PRJ-02',
      dailyWage: 900,
      availability: 'Available',
      status: 'active'
    },
    {
      id: 'WRK-112',
      name: 'Chotelal Maurya',
      skill: 'Waterproofing Applicator',
      phone: '+91 93214 77809',
      assignedProjectId: 'PRJ-01',
      dailyWage: 850,
      availability: 'On Site',
      status: 'active'
    }
  ];

  // Default Attendance records for the current date & recent days
  const todayStr = new Date().toISOString().split('T')[0];
  const initialAttendance = {
    [todayStr]: {
      'WRK-101': 'present',
      'WRK-102': 'present',
      'WRK-103': 'present',
      'WRK-104': 'present',
      'WRK-105': 'present',
      'WRK-106': 'present',
      'WRK-107': 'absent',
      'WRK-108': 'present',
      'WRK-109': 'present',
      'WRK-110': 'present',
      'WRK-111': 'leave',
      'WRK-112': 'present'
    }
  };

  // Seed Data: Construction Materials & Inventory
  const initialMaterials = [
    {
      id: 'MAT-201',
      name: 'UltraTech PPC Cement (50kg)',
      category: 'Cement & Aggregates',
      unit: 'Bags',
      quantity: 420,
      minStockLevel: 250,
      unitPrice: 410,
      supplier: 'UltraTech Building Solutions Hub',
      assignedProjectId: 'PRJ-01',
      lastUpdated: '2026-10-26',
      usageHistory: [
        { date: '2026-10-22', type: 'in', quantity: 300, notes: 'Invoice #UT-8891 shipment', projectId: 'PRJ-01' },
        { date: '2026-10-25', type: 'out', quantity: 80, notes: 'Column casting floor 8', projectId: 'PRJ-01' }
      ]
    },
    {
      id: 'MAT-202',
      name: 'Tata Tiscon 12mm TMT Rebar (Fe 550D)',
      category: 'Steel & Structural Metals',
      unit: 'Tons',
      quantity: 5.5,
      minStockLevel: 10.0,
      unitPrice: 64500,
      supplier: 'Tata Steel Authorized Stockist',
      assignedProjectId: 'PRJ-03',
      lastUpdated: '2026-10-25',
      usageHistory: [
        { date: '2026-10-15', type: 'in', quantity: 12.0, notes: 'Consignment delivery', projectId: 'PRJ-03' },
        { date: '2026-10-24', type: 'out', quantity: 6.5, notes: 'Pier P-14 steel cage fabrication', projectId: 'PRJ-03' }
      ]
    },
    {
      id: 'MAT-203',
      name: 'Tata Tiscon 16mm TMT Rebar (Fe 550D)',
      category: 'Steel & Structural Metals',
      unit: 'Tons',
      quantity: 3.2,
      minStockLevel: 8.0,
      unitPrice: 65200,
      supplier: 'Tata Steel Authorized Stockist',
      assignedProjectId: 'PRJ-01',
      lastUpdated: '2026-10-26',
      usageHistory: [
        { date: '2026-10-10', type: 'in', quantity: 10.0, notes: 'Lot arrival', projectId: 'PRJ-01' },
        { date: '2026-10-23', type: 'out', quantity: 6.8, notes: 'Main beam rebar cages', projectId: 'PRJ-01' }
      ]
    },
    {
      id: 'MAT-204',
      name: 'High-Density Table Mould Red Clay Bricks',
      category: 'Bricks & Masonry',
      unit: 'Pieces',
      quantity: 18500,
      minStockLevel: 5000,
      unitPrice: 9.5,
      supplier: 'Bharat Eco-Bricks Kiln',
      assignedProjectId: 'PRJ-04',
      lastUpdated: '2026-10-24',
      usageHistory: [
        { date: '2026-10-18', type: 'in', quantity: 15000, notes: 'Batch 4 delivery', projectId: 'PRJ-04' }
      ]
    },
    {
      id: 'MAT-205',
      name: 'M-Sand (Graded Washed Concrete Sand)',
      category: 'Cement & Aggregates',
      unit: 'Tons',
      quantity: 165,
      minStockLevel: 60,
      unitPrice: 1250,
      supplier: 'Blue Metal Quarry Corp',
      assignedProjectId: 'PRJ-01',
      lastUpdated: '2026-10-25',
      usageHistory: [
        { date: '2026-10-20', type: 'in', quantity: 100, notes: 'Dumper dispatch', projectId: 'PRJ-01' }
      ]
    },
    {
      id: 'MAT-206',
      name: 'Ready Mix Concrete M35 Pumpable',
      category: 'Cement & Aggregates',
      unit: 'Cu.M',
      quantity: 48,
      minStockLevel: 25,
      unitPrice: 4900,
      supplier: 'ACC Concrete RMC Plant',
      assignedProjectId: 'PRJ-01',
      lastUpdated: '2026-10-27',
      usageHistory: [
        { date: '2026-10-26', type: 'in', quantity: 50, notes: 'Transit mixer fleet batch', projectId: 'PRJ-01' }
      ]
    },
    {
      id: 'MAT-207',
      name: 'Polycab 2.5 sq.mm FR Copper Cable',
      category: 'Electrical & Lighting',
      unit: 'Coils (90m)',
      quantity: 65,
      minStockLevel: 30,
      unitPrice: 1850,
      supplier: 'Polycab National Distributor',
      assignedProjectId: 'PRJ-02',
      lastUpdated: '2026-10-21',
      usageHistory: []
    },
    {
      id: 'MAT-208',
      name: 'Supreme 110mm PVC SWR Pipes (3m)',
      category: 'Plumbing & Sanitary',
      unit: 'Lengths',
      quantity: 14,
      minStockLevel: 50,
      unitPrice: 420,
      supplier: 'Supreme Industries Dealer',
      assignedProjectId: 'PRJ-04',
      lastUpdated: '2026-10-27',
      usageHistory: [
        { date: '2026-10-26', type: 'out', quantity: 36, notes: 'Vertical shaft assembly', projectId: 'PRJ-04' }
      ]
    },
    {
      id: 'MAT-209',
      name: 'Asian Paints Apex Ultima White',
      category: 'Finishes & Paints',
      unit: 'Liters',
      quantity: 340,
      minStockLevel: 100,
      unitPrice: 380,
      supplier: 'Asian Paints Direct Depot',
      assignedProjectId: 'PRJ-02',
      lastUpdated: '2026-10-18',
      usageHistory: []
    },
    {
      id: 'MAT-210',
      name: 'Somany Heavy-Duty Vitrified Tiles (60x120)',
      category: 'Finishes & Paints',
      unit: 'Boxes',
      quantity: 230,
      minStockLevel: 80,
      unitPrice: 1150,
      supplier: 'Somany Tiles Gallery',
      assignedProjectId: 'PRJ-02',
      lastUpdated: '2026-10-20',
      usageHistory: []
    },
    {
      id: 'MAT-211',
      name: 'Dr. Fixit Fastflex Waterproofing Chemical',
      category: 'Chemicals & Admixtures',
      unit: 'Liters',
      quantity: 18,
      minStockLevel: 40,
      unitPrice: 460,
      supplier: 'Pidilite Commercial Agency',
      assignedProjectId: 'PRJ-01',
      lastUpdated: '2026-10-26',
      usageHistory: [
        { date: '2026-10-25', type: 'out', quantity: 22, notes: 'Basement cold joint sealant', projectId: 'PRJ-01' }
      ]
    },
    {
      id: 'MAT-212',
      name: 'Karam ISI Certified Safety Helmets & Harness',
      category: 'Safety & Site Gear',
      unit: 'Sets',
      quantity: 90,
      minStockLevel: 30,
      unitPrice: 520,
      supplier: 'Udyogi Safety Equipment Ltd',
      assignedProjectId: 'PRJ-03',
      lastUpdated: '2026-10-15',
      usageHistory: []
    }
  ];

  // Seed Data: Expenses
  const initialExpenses = [
    {
      id: 'EXP-301',
      title: 'Batch Concrete Supply - RMC M35 (120 Cu.M)',
      projectId: 'PRJ-01',
      category: 'Materials',
      amount: 588000,
      date: '2026-10-25',
      paymentMethod: 'Bank Transfer (RTGS)',
      description: 'Ready-mix concrete for 8th floor deck slab casting. Invoice #ACC-2026-9812.'
    },
    {
      id: 'EXP-302',
      title: 'Fortnightly Labour Wage Disbursement - Masons & Bar Benders',
      projectId: 'PRJ-01',
      category: 'Labour',
      amount: 245000,
      date: '2026-10-20',
      paymentMethod: 'Bank Transfer (NEFT)',
      description: 'Direct wage transfer to 18 workers for fortnight ending 15th October.'
    },
    {
      id: 'EXP-303',
      title: 'Tower Crane Monthly Lease & Fuel Surcharge',
      projectId: 'PRJ-01',
      category: 'Equipment',
      amount: 145000,
      date: '2026-10-18',
      paymentMethod: 'Cheque',
      description: 'Potain 5-ton self-erecting tower crane operation and operator allowance.'
    },
    {
      id: 'EXP-304',
      title: 'Structural Steel Fe550D Consignment (25 Tons)',
      projectId: 'PRJ-03',
      category: 'Materials',
      amount: 1625000,
      date: '2026-10-12',
      paymentMethod: 'Bank Transfer (RTGS)',
      description: '16mm and 25mm high-ductility rebar for Pier P-14 and P-15.'
    },
    {
      id: 'EXP-305',
      title: 'Hydraulic Mobile Crane 75T Hire for Girder Positioning',
      projectId: 'PRJ-03',
      category: 'Equipment',
      amount: 320000,
      date: '2026-10-14',
      paymentMethod: 'Bank Transfer (NEFT)',
      description: 'Heavy lift telescopic crane for placing box girder segments.'
    },
    {
      id: 'EXP-306',
      title: 'Highway Traffic Police Diversion & Marshal Logistics',
      projectId: 'PRJ-03',
      category: 'Transport',
      amount: 75000,
      date: '2026-10-15',
      paymentMethod: 'UPI',
      description: 'Signage, reflective cones, and night marshals for lane closure.'
    },
    {
      id: 'EXP-307',
      title: 'Imported Botticino Italian Marble Slabs (2,200 Sq.Ft)',
      projectId: 'PRJ-02',
      category: 'Materials',
      amount: 680000,
      date: '2026-10-08',
      paymentMethod: 'Cheque',
      description: 'Premium select grade book-matched marble for Villas 1 to 4.'
    },
    {
      id: 'EXP-308',
      title: 'Carpentry & Modular Kitchen Subcontractor Stage 2',
      projectId: 'PRJ-02',
      category: 'Labour',
      amount: 180000,
      date: '2026-10-16',
      paymentMethod: 'Bank Transfer (NEFT)',
      description: 'Internal marine-ply carcass framing and veneer fixing.'
    },
    {
      id: 'EXP-309',
      title: 'Soil Excavation & Muck Shifting 120 Tipper Trips',
      projectId: 'PRJ-04',
      category: 'Transport',
      amount: 195000,
      date: '2026-10-05',
      paymentMethod: 'Bank Transfer (RTGS)',
      description: 'Basement 2 surplus gravel haulage to designated landfill.'
    },
    {
      id: 'EXP-310',
      title: 'Tata Steel Rebar Initial Lot for Foundation (40 Tons)',
      projectId: 'PRJ-04',
      category: 'Materials',
      amount: 2560000,
      date: '2026-09-28',
      paymentMethod: 'Bank Transfer (RTGS)',
      description: 'Raft foundation primary reinforcement steel.'
    },
    {
      id: 'EXP-311',
      title: 'Local Municipal Water Tanker Supply (25 Loads)',
      projectId: 'PRJ-01',
      category: 'Other',
      amount: 45000,
      date: '2026-10-22',
      paymentMethod: 'UPI',
      description: 'Curing water tanker supply due to borewell maintenance.'
    },
    {
      id: 'EXP-312',
      title: 'Laser Screed Flooring Contractor Completion Payment',
      projectId: 'PRJ-05',
      category: 'Equipment',
      amount: 420000,
      date: '2026-08-18',
      paymentMethod: 'Bank Transfer (RTGS)',
      description: 'Somero laser screed machine deployment with steel fiber concrete finish.'
    }
  ];

  // Seed Data: Payments (Disbursements to Suppliers & Contractors)
  const initialPayments = [
    {
      id: 'PAY-401',
      paymentRef: 'PAY-2026-881',
      projectId: 'PRJ-01',
      recipient: 'ACC Concrete RMC Plant',
      amount: 588000,
      date: '2026-10-25',
      status: 'Paid',
      paymentMethod: 'Bank Transfer (RTGS)',
      notes: 'Cleared in full. UTR: HDFC882910481.'
    },
    {
      id: 'PAY-402',
      paymentRef: 'PAY-2026-882',
      projectId: 'PRJ-01',
      recipient: 'Patel Labour Force Services',
      amount: 245000,
      date: '2026-10-20',
      status: 'Paid',
      paymentMethod: 'Bank Transfer (NEFT)',
      notes: 'Fortnightly labour bill settled.'
    },
    {
      id: 'PAY-403',
      paymentRef: 'PAY-2026-883',
      projectId: 'PRJ-03',
      recipient: 'Tata Steel Authorized Stockist',
      amount: 1625000,
      date: '2026-10-13',
      status: 'Paid',
      paymentMethod: 'Bank Transfer (RTGS)',
      notes: 'Advance invoice #TS-77291.'
    },
    {
      id: 'PAY-404',
      paymentRef: 'PAY-2026-884',
      projectId: 'PRJ-03',
      recipient: 'Surendra Heavy Crane Lifters',
      amount: 320000,
      date: '2026-10-15',
      status: 'Paid',
      paymentMethod: 'Bank Transfer (NEFT)',
      notes: 'Mobilization & lifting charge.'
    },
    {
      id: 'PAY-405',
      paymentRef: 'PAY-2026-885',
      projectId: 'PRJ-02',
      recipient: 'Classic Stone & Marbles Chennai',
      amount: 450000,
      date: '2026-10-10',
      status: 'Paid',
      paymentMethod: 'Cheque (#004918)',
      notes: 'Part payment for marble consignment.'
    },
    {
      id: 'PAY-406',
      paymentRef: 'PAY-2026-886',
      projectId: 'PRJ-02',
      recipient: 'Classic Stone & Marbles Chennai',
      amount: 230000,
      date: '2026-10-28',
      status: 'Pending',
      paymentMethod: 'Bank Transfer (RTGS)',
      notes: 'Balance upon inspection of polished floors.'
    },
    {
      id: 'PAY-407',
      paymentRef: 'PAY-2026-887',
      projectId: 'PRJ-04',
      recipient: 'Deccan Earthmovers & Haulage',
      amount: 195000,
      date: '2026-10-06',
      status: 'Paid',
      paymentMethod: 'Bank Transfer (RTGS)',
      notes: 'Cleared for 120 trips.'
    },
    {
      id: 'PAY-408',
      paymentRef: 'PAY-2026-888',
      projectId: 'PRJ-01',
      recipient: 'Speedway Cranes & Hoists',
      amount: 145000,
      date: '2026-10-19',
      status: 'Paid',
      paymentMethod: 'Cheque (#009124)',
      notes: 'Tower crane monthly rental.'
    },
    {
      id: 'PAY-409',
      paymentRef: 'PAY-2026-889',
      projectId: 'PRJ-04',
      recipient: 'Bharat Eco-Bricks Kiln',
      amount: 175750,
      date: '2026-10-29',
      status: 'Pending',
      paymentMethod: 'Cheque',
      notes: 'Payment scheduled against delivery challan 18,500 bricks.'
    }
  ];

  // Seed Data: Daily Progress Reports
  const initialProgress = [
    {
      id: 'DPR-501',
      projectId: 'PRJ-01',
      date: '2026-10-27',
      workCompleted: 'Cast 14 columns on 9th floor using M35 RMC. Curing water spraying maintained on 8th-floor deck slab.',
      progressPercentage: 72,
      workersPresent: 18,
      materialsConsumed: '48 Cu.M RMC, 45 bags cement, 1.2 tons rebar ties',
      issuesEncountered: 'Brief 40-minute concrete pump blockage cleared by crew with zero structural cold joint.',
      delayBlockers: 'None today; work running on revised recovery schedule.',
      nextDayPlan: 'Strip column forms, begin 9th floor deck staging and prop scaffolding.',
      reportedBy: 'Er. Rajesh Kumar (Site In-charge)'
    },
    {
      id: 'DPR-502',
      projectId: 'PRJ-01',
      date: '2026-10-26',
      workCompleted: 'Plumbing core drilling and HVAC duct bracket fixing on 6th floor completed. Elevator well guide rails checked.',
      progressPercentage: 71,
      workersPresent: 16,
      materialsConsumed: '35m PVC conduit, 60 anchor fasteners',
      issuesEncountered: 'Low stock of 16mm rebar requires prompt vendor follow-up.',
      delayBlockers: 'Need structural approval for slab cutout adjustment on floor 7.',
      nextDayPlan: 'Pour 9th floor columns with ready-mix trucks arriving at 09:30 AM.',
      reportedBy: 'Dinesh Kumar (Supervisor)'
    },
    {
      id: 'DPR-503',
      projectId: 'PRJ-02',
      date: '2026-10-27',
      workCompleted: 'Completed marble abrasive diamond grinding in Villa 3 master bedroom and living foyer. External compound wall plastering 85% done.',
      progressPercentage: 88,
      workersPresent: 12,
      materialsConsumed: '18 bags white cement, 4 tins diamond abrasives, 80kg plaster mortar',
      issuesEncountered: 'Intermittent coastal drizzles slowed down exterior primer coat drying.',
      delayBlockers: 'None.',
      nextDayPlan: 'Apply epoxy resin coat to hairline veins in Villa 4 marble and buff to 1000 grit finish.',
      reportedBy: 'Er. S. Ananth (Project Engineer)'
    },
    {
      id: 'DPR-504',
      projectId: 'PRJ-03',
      date: '2026-10-26',
      workCompleted: 'Fabricated high-tensile steel cage for Pier P-14 cap. Conducted ultrasonic weld tests on steel brackets.',
      progressPercentage: 64,
      workersPresent: 22,
      materialsConsumed: '6.5 tons 25mm TMT bars, 40kg welding electrodes',
      issuesEncountered: 'Municipal traffic police night-shift clearance pending for heavy girder transporter access.',
      delayBlockers: 'Police night-time corridor permission delayed by 6 days. Heavy machinery idle during daylight hours.',
      nextDayPlan: 'Attend coordination meeting at Traffic HQ, Worli; continue precast segment curing.',
      reportedBy: 'Er. Vikram Shinde (Civil GM)'
    },
    {
      id: 'DPR-505',
      projectId: 'PRJ-04',
      date: '2026-10-27',
      workCompleted: 'Completed 5th floor slab shuttering ply laying. Placed bottom rebar cover blocks and started electrical conduit routing.',
      progressPercentage: 35,
      workersPresent: 19,
      materialsConsumed: '85 shuttering plywood sheets, 140m PVC conduit, 3.8 tons 10mm rebar',
      issuesEncountered: 'PVC pipe stock low; additional 50 lengths required by Thursday.',
      delayBlockers: 'None. Pouring planned for upcoming Saturday.',
      nextDayPlan: 'Complete top steel mat tying and arrange independent quality inspection.',
      reportedBy: 'Er. K. V. Rao (Site Lead)'
    }
  ];

  // Seed Settings
  const initialSettings = {
    companyName: 'BuildTrack Infrastructure & Construction LLP',
    contractorName: 'Er. Rajesh Kumar',
    email: 'admin@buildtrack.com',
    phone: '+91 98450 12345',
    gstin: '29ABCDE1234F1Z5',
    licenseNumber: 'PWD/CLASS-1/BLR/2021/049',
    currency: 'INR',
    currencySymbol: '₹',
    dateFormat: 'DD/MM/YYYY',
    theme: 'light',
    notifications: {
      budgetThreshold: 85,
      overdueTasks: true,
      lowStockAlerts: true,
      deadlineAlertsDays: 14
    }
  };

  // Demo User Session
  const defaultUser = {
    name: 'Er. Rajesh Kumar',
    role: 'Contractor / Admin',
    email: 'admin@buildtrack.com',
    avatar: 'assets/avatar.png'
  };

  // Safe LocalStorage Wrappers
  function loadFromStorage(key, fallback) {
    try {
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : fallback;
    } catch (e) {
      console.error('BuildTrack Storage Read Error:', e);
      return fallback;
    }
  }

  function saveToStorage(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      // Notify components about data change
      window.dispatchEvent(new CustomEvent('buildtrack:datachanged', { detail: { key } }));
    } catch (e) {
      console.error('BuildTrack Storage Write Error:', e);
    }
  }

  // Initialize Default Data if Not Set
  function initializeData() {
    if (!localStorage.getItem(STORAGE_KEYS.INITIALIZED)) {
      localStorage.setItem(STORAGE_KEYS.PROJECTS, JSON.stringify(initialProjects));
      localStorage.setItem(STORAGE_KEYS.TASKS, JSON.stringify(initialTasks));
      localStorage.setItem(STORAGE_KEYS.LABOUR, JSON.stringify(initialLabour));
      localStorage.setItem(STORAGE_KEYS.MATERIALS, JSON.stringify(initialMaterials));
      localStorage.setItem(STORAGE_KEYS.EXPENSES, JSON.stringify(initialExpenses));
      localStorage.setItem(STORAGE_KEYS.PAYMENTS, JSON.stringify(initialPayments));
      localStorage.setItem(STORAGE_KEYS.PROGRESS, JSON.stringify(initialProgress));
      localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(initialSettings));
      localStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(defaultUser));
      localStorage.setItem('buildtrack_attendance', JSON.stringify(initialAttendance));
      localStorage.setItem(STORAGE_KEYS.INITIALIZED, 'true');
    }
  }

  // Master DataStore API
  window.DataStore = {
    init: initializeData,

    // Reset to pristine sample data
    resetToDefault: function () {
      localStorage.setItem(STORAGE_KEYS.PROJECTS, JSON.stringify(initialProjects));
      localStorage.setItem(STORAGE_KEYS.TASKS, JSON.stringify(initialTasks));
      localStorage.setItem(STORAGE_KEYS.LABOUR, JSON.stringify(initialLabour));
      localStorage.setItem(STORAGE_KEYS.MATERIALS, JSON.stringify(initialMaterials));
      localStorage.setItem(STORAGE_KEYS.EXPENSES, JSON.stringify(initialExpenses));
      localStorage.setItem(STORAGE_KEYS.PAYMENTS, JSON.stringify(initialPayments));
      localStorage.setItem(STORAGE_KEYS.PROGRESS, JSON.stringify(initialProgress));
      localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(initialSettings));
      localStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(defaultUser));
      localStorage.setItem('buildtrack_attendance', JSON.stringify(initialAttendance));
      localStorage.setItem(STORAGE_KEYS.INITIALIZED, 'true');
      window.dispatchEvent(new CustomEvent('buildtrack:datachanged', { detail: { key: 'all_reset' } }));
      return true;
    },

    // --- Projects ---
    getProjects: function () {
      return loadFromStorage(STORAGE_KEYS.PROJECTS, initialProjects);
    },
    getProject: function (id) {
      return this.getProjects().find(p => p.id === id) || null;
    },
    saveProject: function (project) {
      const list = this.getProjects();
      const index = list.findIndex(p => p.id === project.id);
      if (index >= 0) {
        list[index] = { ...list[index], ...project };
      } else {
        if (!project.id) project.id = 'PRJ-' + String(list.length + 1).padStart(2, '0');
        list.push(project);
      }
      saveToStorage(STORAGE_KEYS.PROJECTS, list);
      return project;
    },
    deleteProject: function (id) {
      let list = this.getProjects();
      list = list.filter(p => p.id !== id);
      saveToStorage(STORAGE_KEYS.PROJECTS, list);
      return true;
    },

    // --- Tasks ---
    getTasks: function (projectId) {
      let tasks = loadFromStorage(STORAGE_KEYS.TASKS, initialTasks);
      if (projectId && projectId !== 'all') {
        tasks = tasks.filter(t => t.projectId === projectId);
      }
      return tasks;
    },
    getTask: function (id) {
      return this.getTasks().find(t => t.id === id) || null;
    },
    saveTask: function (task) {
      const list = this.getTasks();
      const index = list.findIndex(t => t.id === task.id);
      if (index >= 0) {
        list[index] = { ...list[index], ...task };
      } else {
        if (!task.id) task.id = 'TSK-' + Math.floor(100 + Math.random() * 900);
        list.push(task);
      }
      saveToStorage(STORAGE_KEYS.TASKS, list);
      return task;
    },
    deleteTask: function (id) {
      let list = this.getTasks();
      list = list.filter(t => t.id !== id);
      saveToStorage(STORAGE_KEYS.TASKS, list);
      return true;
    },

    // --- Labour ---
    getLabour: function (projectId) {
      let list = loadFromStorage(STORAGE_KEYS.LABOUR, initialLabour);
      if (projectId && projectId !== 'all') {
        list = list.filter(w => w.assignedProjectId === projectId);
      }
      return list;
    },
    getWorker: function (id) {
      return this.getLabour().find(w => w.id === id) || null;
    },
    saveWorker: function (worker) {
      const list = this.getLabour();
      const index = list.findIndex(w => w.id === worker.id);
      if (index >= 0) {
        list[index] = { ...list[index], ...worker };
      } else {
        if (!worker.id) worker.id = 'WRK-' + Math.floor(100 + Math.random() * 900);
        list.push(worker);
      }
      saveToStorage(STORAGE_KEYS.LABOUR, list);
      return worker;
    },
    deleteWorker: function (id) {
      let list = this.getLabour();
      list = list.filter(w => w.id !== id);
      saveToStorage(STORAGE_KEYS.LABOUR, list);
      return true;
    },
    getAttendance: function (dateStr) {
      const date = dateStr || new Date().toISOString().split('T')[0];
      const all = loadFromStorage('buildtrack_attendance', initialAttendance);
      return all[date] || {};
    },
    saveAttendance: function (dateStr, records) {
      const all = loadFromStorage('buildtrack_attendance', initialAttendance);
      all[dateStr] = records;
      saveToStorage('buildtrack_attendance', all);
      return records;
    },

    // --- Materials & Inventory ---
    getMaterials: function (projectId) {
      let list = loadFromStorage(STORAGE_KEYS.MATERIALS, initialMaterials);
      if (projectId && projectId !== 'all') {
        list = list.filter(m => m.assignedProjectId === projectId || !m.assignedProjectId);
      }
      return list;
    },
    getMaterial: function (id) {
      return this.getMaterials().find(m => m.id === id) || null;
    },
    saveMaterial: function (material) {
      const list = this.getMaterials();
      const index = list.findIndex(m => m.id === material.id);
      if (index >= 0) {
        list[index] = { ...list[index], ...material };
      } else {
        if (!material.id) material.id = 'MAT-' + Math.floor(200 + Math.random() * 800);
        if (!material.usageHistory) material.usageHistory = [];
        list.push(material);
      }
      saveToStorage(STORAGE_KEYS.MATERIALS, list);
      return material;
    },
    deleteMaterial: function (id) {
      let list = this.getMaterials();
      list = list.filter(m => m.id !== id);
      saveToStorage(STORAGE_KEYS.MATERIALS, list);
      return true;
    },
    recordMaterialStock: function (materialId, type, quantity, notes, projectId) {
      const list = this.getMaterials();
      const item = list.find(m => m.id === materialId);
      if (!item) return { success: false, message: 'Material not found' };

      const qty = parseFloat(quantity);
      if (isNaN(qty) || qty <= 0) return { success: false, message: 'Invalid quantity' };

      if (type === 'out') {
        if (item.quantity < qty) {
          return { success: false, message: `Insufficient stock! Current available stock is ${item.quantity} ${item.unit}` };
        }
        item.quantity -= qty;
      } else if (type === 'in') {
        item.quantity += qty;
      }

      if (!item.usageHistory) item.usageHistory = [];
      item.usageHistory.unshift({
        date: new Date().toISOString().split('T')[0],
        type: type,
        quantity: qty,
        notes: notes || (type === 'in' ? 'Stock replenishment' : 'Site consumption'),
        projectId: projectId || item.assignedProjectId
      });
      item.lastUpdated = new Date().toISOString().split('T')[0];

      saveToStorage(STORAGE_KEYS.MATERIALS, list);
      return { success: true, material: item };
    },

    // --- Expenses ---
    getExpenses: function (projectId) {
      let list = loadFromStorage(STORAGE_KEYS.EXPENSES, initialExpenses);
      if (projectId && projectId !== 'all') {
        list = list.filter(e => e.projectId === projectId);
      }
      return list;
    },
    getExpense: function (id) {
      return this.getExpenses().find(e => e.id === id) || null;
    },
    saveExpense: function (expense) {
      const list = this.getExpenses();
      const index = list.findIndex(e => e.id === expense.id);
      if (index >= 0) {
        list[index] = { ...list[index], ...expense };
      } else {
        if (!expense.id) expense.id = 'EXP-' + Math.floor(300 + Math.random() * 700);
        list.unshift(expense);
      }
      saveToStorage(STORAGE_KEYS.EXPENSES, list);

      // Recalculate Project's total spent
      this.recalculateProjectSpending(expense.projectId);
      return expense;
    },
    deleteExpense: function (id) {
      let list = this.getExpenses();
      const item = list.find(e => e.id === id);
      list = list.filter(e => e.id !== id);
      saveToStorage(STORAGE_KEYS.EXPENSES, list);
      if (item && item.projectId) {
        this.recalculateProjectSpending(item.projectId);
      }
      return true;
    },
    recalculateProjectSpending: function (projectId) {
      if (!projectId) return;
      const allExpenses = this.getExpenses(projectId);
      const total = allExpenses.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);
      const project = this.getProject(projectId);
      if (project) {
        project.spent = total;
        this.saveProject(project);
      }
    },

    // --- Payments (Disbursements) ---
    getPayments: function (projectId) {
      let list = loadFromStorage(STORAGE_KEYS.PAYMENTS, initialPayments);
      if (projectId && projectId !== 'all') {
        list = list.filter(p => p.projectId === projectId);
      }
      return list;
    },
    getPayment: function (id) {
      return this.getPayments().find(p => p.id === id) || null;
    },
    savePayment: function (payment) {
      const list = this.getPayments();
      const index = list.findIndex(p => p.id === payment.id);
      if (index >= 0) {
        list[index] = { ...list[index], ...payment };
      } else {
        if (!payment.id) payment.id = 'PAY-' + Math.floor(400 + Math.random() * 600);
        if (!payment.paymentRef) payment.paymentRef = 'PAY-' + new Date().getFullYear() + '-' + Math.floor(100 + Math.random() * 900);
        list.unshift(payment);
      }
      saveToStorage(STORAGE_KEYS.PAYMENTS, list);
      return payment;
    },
    deletePayment: function (id) {
      let list = this.getPayments();
      list = list.filter(p => p.id !== id);
      saveToStorage(STORAGE_KEYS.PAYMENTS, list);
      return true;
    },

    // --- Daily Progress Reports ---
    getProgressReports: function (projectId) {
      let list = loadFromStorage(STORAGE_KEYS.PROGRESS, initialProgress);
      if (projectId && projectId !== 'all') {
        list = list.filter(r => r.projectId === projectId);
      }
      return list;
    },
    getProgressReport: function (id) {
      return this.getProgressReports().find(r => r.id === id) || null;
    },
    saveProgressReport: function (report) {
      const list = this.getProgressReports();
      const index = list.findIndex(r => r.id === report.id);
      if (index >= 0) {
        list[index] = { ...list[index], ...report };
      } else {
        if (!report.id) report.id = 'DPR-' + Math.floor(500 + Math.random() * 500);
        list.unshift(report);
      }
      saveToStorage(STORAGE_KEYS.PROGRESS, list);

      // If progress report contains a new progress percentage, update project completion
      if (report.progressPercentage && report.projectId) {
        const project = this.getProject(report.projectId);
        if (project) {
          project.progress = Math.min(100, Math.max(0, parseInt(report.progressPercentage, 10)));
          if (project.progress >= 100) project.status = 'completed';
          this.saveProject(project);
        }
      }
      return report;
    },
    deleteProgressReport: function (id) {
      let list = this.getProgressReports();
      list = list.filter(r => r.id !== id);
      saveToStorage(STORAGE_KEYS.PROGRESS, list);
      return true;
    },

    // --- Settings & Profile ---
    getSettings: function () {
      return loadFromStorage(STORAGE_KEYS.SETTINGS, initialSettings);
    },
    saveSettings: function (settings) {
      saveToStorage(STORAGE_KEYS.SETTINGS, settings);
      return settings;
    },

    // --- Authentication & Session Prototype ---
    getUser: function () {
      return loadFromStorage(STORAGE_KEYS.CURRENT_USER, defaultUser);
    },
    saveUser: function (user) {
      saveToStorage(STORAGE_KEYS.CURRENT_USER, user);
      return user;
    },
    login: function (email, password, role) {
      // Frontend-only prototype validation: accept plausible inputs without storing passwords.
      if (email.includes('@') && password.length >= 6 && window.BuildTrack.isSupportedRole(role)) {
        const user = {
          name: email.trim().split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase()),
          role,
          email: email.trim(),
          avatar: 'assets/avatar.png'
        };
        this.saveUser(user);
        return { success: true, user };
      }
      return { success: false, message: 'Enter a valid email, a password with at least 6 characters, and select a listed role.' };
    },
    logout: function () {
      localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
      window.dispatchEvent(new CustomEvent('buildtrack:authchanged', { detail: { loggedIn: false } }));
      return true;
    },
    isLoggedIn: function () {
      return !!localStorage.getItem(STORAGE_KEYS.CURRENT_USER);
    }
  };

  // Run initialization immediately
  window.DataStore.init();
})();
