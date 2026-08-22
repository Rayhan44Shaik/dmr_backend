# DMR Poultries ERP

# Masters Module Rules

The Masters module is the foundation of the ERP.

Every Operations, Accounts, Reports and future Mobile module depends on Master data.

Never redesign any Master UI.

Never change existing layouts.

Always preserve the current user experience.

-------------------------------------------------------

MASTER MODULES

Employees

Vehicles

Farms

Shops

Bird Types

Banks

-------------------------------------------------------

SOURCE OF TRUTH

PostgreSQL is the only source of truth.

Never use:

localStorage

sessionStorage

mock arrays

temporary JSON files

hardcoded master data

All data must come from backend APIs.

-------------------------------------------------------

API CLIENT

Always use the shared Axios client.

Never create another Axios instance.

Never use fetch().

Reuse existing service layer.

-------------------------------------------------------

EMPLOYEES

Source:

/api/masters/employees

Support:

Create

Edit

Delete

Search

Pagination

Department filter

Status filter

Refresh after save

Never use employee mock data.

Never use demo arrays.

Always reload latest employees after successful save.

-------------------------------------------------------

VEHICLES

Source:

/api/masters/vehicles

Support:

Create

Edit

Delete

Search

Pagination

Vehicle Status

Vehicle Type

Driver Assignment

Refresh after every mutation.

Vehicle IDs always come from PostgreSQL.

-------------------------------------------------------

FARMS

Source:

/api/masters/farms

Support:

Create

Edit

Delete

Search

Pagination

Farm Status

Address

Contact Person

Bird Capacity

Never generate fake IDs.

-------------------------------------------------------

SHOPS

Source:

/api/masters/shops

Support:

Create

Edit

Delete

Search

Pagination

Credit Limit

Outstanding

Status

Always reload after successful CRUD.

-------------------------------------------------------

BIRD TYPES

Source:

/api/masters/bird-types

Support:

Create

Edit

Delete

Status

Weight Range

Default values

-------------------------------------------------------

BANKS

Source:

/api/masters/banks

Support:

Create

Edit

Delete

Status

Account Number

IFSC

Branch

-------------------------------------------------------

CRUD RULES

Every Create:

Validate

POST

Reload latest list

Show success notification

Every Update:

Validate

PUT

Reload latest data

Keep pagination

Keep filters

Keep search

Every Delete:

Confirmation dialog

DELETE

Reload latest data

Keep current page if possible

-------------------------------------------------------

VALIDATION

Never bypass validation.

Validate required fields.

Show proper validation messages.

Never silently fail.

-------------------------------------------------------

ERROR HANDLING

Handle:

400

401

403

404

409

422

500

Network Failure

Timeout

Retry

Display meaningful user messages.

-------------------------------------------------------

SEARCH

Search always happens from backend if API exists.

Do not search old cached data.

-------------------------------------------------------

FILTERS

Department

Status

Vehicle

Farm

Shop

Bird Type

Always preserve selected filters after CRUD.

-------------------------------------------------------

PAGINATION

Always use backend pagination if available.

Never calculate total records locally when backend returns totals.

-------------------------------------------------------

REFRESH

After successful Create / Update / Delete:

Reload latest data from PostgreSQL.

Never manually update local arrays.

Backend is always correct.

-------------------------------------------------------

CODE QUALITY

Reuse existing hooks.

Reuse existing services.

Reuse existing forms.

Reuse existing dialogs.

Never duplicate components.

Never duplicate API logic.

-------------------------------------------------------

BUSINESS RULE

Master data is shared across the entire ERP.

Trip Entry

Accounts

Collections

Reports

Fuel

Mobile App

All modules must use the same master records.

Never create duplicate Employees.

Never create duplicate Vehicles.

Never create duplicate Farms.

Never create duplicate Shops.

Never create duplicate Banks.

Never create duplicate Bird Types.

-------------------------------------------------------

FUTURE MOBILE SUPPORT

The mobile app will use the same backend APIs.

Design every master module so that:

Web

Mobile

Office Laptop

Supervisor Phone

Owner Dashboard

all consume the same PostgreSQL data.

Never add frontend-only master records.

-------------------------------------------------------

FINAL RULE

Masters are the backbone of the ERP.

Every master change must immediately be available to all modules through PostgreSQL.

Never use mock data again.

Never use localStorage for master data.

Always protect data integrity.

Think before modifying any Master module.