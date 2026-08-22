# DMR Poultries ERP

# Database Rules

Version 1.0

PostgreSQL is the SINGLE SOURCE OF TRUTH.

Frontend never owns business data.

Backend owns all business logic.

Every business record must exist in PostgreSQL.

Never use localStorage for business data.

------------------------------------------------------------

DATABASE PRINCIPLES

The database is designed using normalized tables.

Never duplicate business information.

Always use foreign keys.

Never store derived values unless required for reporting.

Every business action must be traceable.

------------------------------------------------------------

PRIMARY TABLES

Masters

Employees

Vehicles

Farms

Shops

Bird Types

Banks

Operations

Trips

Trip Crew

Trip Boxes

Trip Deliveries

Trip Delivery Boxes

Trip Delivery Per Box

Trip Diesel Entries

Trip Media

Fuel Expenses

HR

Attendance

Duty Assignments

Leaves

Salary

Advance Loans

------------------------------------------------------------

TRIP OWNERSHIP

Trip is the parent entity.

Every related table references Trip ID.

Trips

↓

Trip Crew

↓

Trip Boxes

↓

Trip Deliveries

↓

Trip Delivery Boxes

↓

Trip Delivery Per Box

↓

Trip Diesel Entries

↓

Trip Media

↓

Fuel Expenses

Never create child records without a valid Trip ID.

------------------------------------------------------------

PRIMARY KEYS

Every table uses PostgreSQL generated IDs.

Frontend never generates IDs.

Backend always returns IDs.

Frontend stores only returned IDs.

------------------------------------------------------------

FOREIGN KEYS

Always enforce relationships.

Example

trip_crew.trip_id

references

trips.id

trip_boxes.trip_id

references

trips.id

trip_deliveries.trip_id

references

trips.id

Never bypass foreign key validation.

------------------------------------------------------------

STATUS RULES

Trips

Draft

Pending

Completed

Rejected

Deleted

Fuel

Pending

Approved

Rejected

Employees

Active

Inactive

Never invent new status values.

------------------------------------------------------------

SOFT DELETE

Business data is never permanently deleted.

Deleted records remain in PostgreSQL.

Mark records using:

Status = Deleted

or

deleted_at timestamp

Reports exclude deleted records unless requested.

------------------------------------------------------------

AUDIT FIELDS

Every business table should support:

created_at

created_by

updated_at

updated_by

approved_at

approved_by

deleted_at

deleted_by

Never overwrite audit history.

------------------------------------------------------------

TRANSACTIONS

Use database transactions whenever multiple tables are modified.

Example

Trip

+

Crew

+

Deliveries

+

Boxes

+

Fuel

must commit together.

Rollback everything if one operation fails.

Never leave partial data.

------------------------------------------------------------

AUTOSAVE

Autosave writes directly to PostgreSQL.

Every save updates the same Trip.

Never create duplicate Trips.

Browser refresh must restore data from PostgreSQL.

------------------------------------------------------------

CONCURRENCY

Support multiple users.

If another user modifies a Trip:

Reload latest data.

Prevent silent overwrite.

Future mobile synchronization must use the same strategy.

------------------------------------------------------------

IMAGE STORAGE

Trip images belong to Trip Media.

Only store metadata in PostgreSQL.

Image files should be stored externally.

Database stores:

Trip ID

Image URL

Image Type

Created Time

Uploaded By

------------------------------------------------------------

CALCULATED VALUES

Do not permanently store values that can be calculated.

Examples

Farm Amount

Weight Totals

Delivery Totals

Expense Totals

Profit

Loss

Prefer calculating from source records.

------------------------------------------------------------

REPORTING

Dashboard

Reports

Accounts

Collections

Fuel

must all read from PostgreSQL.

Never read from frontend cache.

------------------------------------------------------------

API OWNERSHIP

Frontend

Collect user input

Validate UI

Display results

Backend

Business Rules

Validation

Transactions

Calculations

Persistence

PostgreSQL

Data Integrity

Relationships

Storage

Never move backend business logic into React.

------------------------------------------------------------

ERROR HANDLING

Database errors

Validation errors

Constraint violations

Duplicate keys

Foreign key failures

Timeouts

must return meaningful API responses.

Frontend must never hide database errors.

------------------------------------------------------------

PERFORMANCE

Use indexes.

Avoid N+1 queries.

Use pagination.

Load related entities efficiently.

Avoid unnecessary database writes.

------------------------------------------------------------

FUTURE MOBILE SUPPORT

Android

Web

Office Laptop

Supervisor

Owner

All use the same APIs.

All use the same PostgreSQL database.

No client owns business data.

------------------------------------------------------------

FINAL RULE

PostgreSQL is the HEART of the ERP.

Every module depends on database integrity.

Never compromise data consistency for development speed.

Think before modifying database behavior.