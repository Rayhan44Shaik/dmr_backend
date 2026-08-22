# DMR Poultries ERP

# Trip Entry Production Test Plan

Version: 1.0

Purpose

This document defines the production acceptance criteria for the Trip Entry module.

Trip Entry is the HEART of the ERP.

Every implementation must pass every test in this document before merging.

------------------------------------------------------------

MODULES AFFECTED

Trip Entry

Trip List

Dashboard

Fuel Expenses

Shop Sales

Collections

Accounts

Reports

Future Mobile App

------------------------------------------------------------

GOAL

Ensure that every Trip can safely move through the complete business workflow without data loss.

All business data must exist in PostgreSQL.

Never depend on localStorage.

------------------------------------------------------------

MASTER DATA TESTS

Verify:

✓ Employee exists

✓ Vehicle exists

✓ Farm exists

✓ Bird Type exists

✓ Shop exists

✓ Bank exists

If missing:

Create through Masters API.

Never create duplicates.

------------------------------------------------------------

STEP 1 TESTS

Trip Header

TC-001

Create Draft Trip

Expected

Trip created in PostgreSQL

Status = Draft

Trip Number generated

Trip ID returned

------------------------------------

TC-002

Refresh browser

Expected

Draft still exists

------------------------------------

TC-003

Edit Driver

Expected

Database updated

------------------------------------

TC-004

Edit Vehicle

Expected

Database updated

------------------------------------

TC-005

Change Supervisor

Expected

Database updated

------------------------------------

TC-006

Opening KM validation

Reject invalid values

------------------------------------

TC-007

Advance validation

Reject invalid amount

------------------------------------

TC-008

Save Draft

Expected

No duplicate Trip

Same Trip ID

------------------------------------------------------------

STEP 2 TESTS

Farm Loading

TC-020

Add Loading Row

Expected

Database updated

------------------------------------

TC-021

Add Multiple Farms

Expected

Rows saved

------------------------------------

TC-022

Edit Loading Row

Expected

Changes persisted

------------------------------------

TC-023

Delete Loading Row

Expected

Database updated

------------------------------------

TC-024

Upload Photos

Expected

Images stored

------------------------------------

TC-025

Refresh Browser

Expected

Rows restored

------------------------------------

TC-026

Change Bird Count

Totals recalculate

------------------------------------------------------------

STEP 3 TESTS

Shop Delivery

TC-040

Add Shop

TC-041

Edit Shop

TC-042

Delete Shop

TC-043

Add Boxes

TC-044

Mortality Calculation

TC-045

Weight Validation

TC-046

Refresh

TC-047

Resume Draft

TC-048

Totals Match

Expected

Everything restored exactly.

------------------------------------------------------------

STEP 4 TESTS

Diesel

TC-060

Add Diesel Bill

TC-061

Edit Diesel

TC-062

Delete Diesel

TC-063

Upload Bill

TC-064

Meter Validation

TC-065

Multiple Bills

TC-066

Refresh

------------------------------------------------------------

Expenses

TC-070

Driver Bata

TC-071

Helper Bata

TC-072

Meals

TC-073

Loading

TC-074

Toll

TC-075

Misc

TC-076

Multiple Expense Rows

TC-077

Edit

TC-078

Delete

------------------------------------------------------------

STEP 5 TESTS

Review

Verify:

Trip Header

Crew

Farm

Boxes

Deliveries

Diesel

Expenses

Images

Totals

Summary

Everything must come from PostgreSQL.

------------------------------------------------------------

DRAFT TESTS

Create Draft

Resume Draft

Edit Draft

Delete Draft

Refresh Browser

Reopen

Multiple Drafts

Same Vehicle

Different Vehicle

Different Dates

------------------------------------------------------------

AUTOSAVE TESTS

Every field change

Every row add

Every row delete

Every image upload

Every expense change

Every diesel change

Every delivery change

Every crew change

Every box change

Every Next click

Every Save Draft

Expected

Immediately saved.

------------------------------------------------------------

STATUS TESTS

Draft

↓

Pending

↓

Completed

↓

Deleted

Reject invalid transitions.

------------------------------------------------------------

APPROVAL TESTS

Submit Trip

Manager Approval

Reject Trip

Reopen Draft

Fuel Approval

Collection Approval

------------------------------------------------------------

DATABASE TESTS

Verify:

Trips

Trip Crew

Trip Boxes

Trip Deliveries

Trip Delivery Boxes

Trip Delivery Per Box

Trip Diesel Entries

Trip Media

Fuel Expenses

Every record must reference the SAME Trip ID.

------------------------------------------------------------

REPORT TESTS

Dashboard

Trip List

Fuel

Collections

Accounts

Reports

Verify numbers match PostgreSQL.

------------------------------------------------------------

API TESTS

Network Failure

500 Error

404

409 Conflict

Retry

Timeout

Offline

Unauthorized

Forbidden

------------------------------------------------------------

MULTI USER TESTS

Laptop edits

Supervisor edits

Manager edits

Owner approves

Verify synchronization.

------------------------------------------------------------

MOBILE READY TESTS

Driver starts on mobile

Owner opens on web

Supervisor edits

Driver resumes

Same Trip ID

Same PostgreSQL data

------------------------------------------------------------

PERFORMANCE TESTS

100 Trips

1000 Deliveries

10000 Boxes

Large Images

Slow Network

Verify application remains responsive.

------------------------------------------------------------

SECURITY TESTS

Role validation

Unauthorized API

Invalid IDs

SQL Injection

XSS

File Upload

------------------------------------------------------------

ACCEPTANCE CRITERIA

Trip Entry is production ready only when:

✓ No localStorage

✓ PostgreSQL only

✓ Autosave works

✓ Resume works

✓ Refresh works

✓ Images work

✓ API retry works

✓ Validation works

✓ Dashboard matches

✓ Reports match

✓ Collections match

✓ Accounts match

✓ Fuel workflow matches

✓ Mobile architecture supported

✓ No duplicate Trips

✓ No orphan records

✓ Clean code

✓ Existing UI preserved

✓ All tests pass

Only then may the Pull Request be merged.