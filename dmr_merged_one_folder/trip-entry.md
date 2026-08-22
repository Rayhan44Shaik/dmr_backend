# DMR Poultries ERP

# Trip Entry Rules

Trip Entry is the HEART of the ERP.

Every future module depends on Trip Entry.

Never redesign Trip Entry.

Preserve every existing UI element.

----------------------------------------

## Workflow

Step 1

Trip Header

↓

Step 2

Farm Loading

↓

Step 3

Shop Delivery

↓

Step 4

Diesel & Expenses

↓

Step 5

Review

↓

Submit

↓

Pending

↓

Completed

----------------------------------------

## Autosave

Every important action must autosave.

Examples:

Next

Save Draft

Add Row

Edit Row

Delete Row

Upload Image

Expense Change

Box Change

Delivery Change

Crew Change

Immediately persist to backend.

Never wait until Step 5.

----------------------------------------

## Draft Rules

A Draft must be resumable.

Browser refresh must not lose data.

Laptop must resume.

Future Mobile App must resume.

Multiple users must see latest data.

Draft always comes from PostgreSQL.

Never localStorage.

----------------------------------------

## Trip Header

Store:

Trip Number

Trip Date

Vehicle

Driver

Supervisor

Helpers

Start Time

Opening KM

Advance

Remarks

Status

Never lose Step 1 data.

----------------------------------------

## Farm Loading

Support:

Multiple rows

Multiple farms

Multiple bird types

Multiple images

Arrival Time

Loading Start

Loading End

Bird Count

Average Weight

Total Weight

Farm Rate

Farm Amount

Boxes

Remarks

Everything autosaves.

----------------------------------------

## Shop Delivery

Support:

Multiple shops

Multiple rows

Edit

Delete

Reorder

Mortality

Weight

Bird Count

Rate

Amount

Boxes

Delivery images

Auto calculate totals.

----------------------------------------

## Diesel

Support:

Multiple bills

Pump

Bill Number

Rate

Litres

Meter

Amount

Images

GPS ready for future mobile app.

----------------------------------------

## Expenses

Support:

Driver Bata

Helper Bata

Meals

Loading

Toll

Misc

Multiple rows

Autosave after every change.

----------------------------------------

## Review

Never calculate locally.

Everything shown here must come from PostgreSQL.

Review loads:

Header

Crew

Farm

Boxes

Deliveries

Diesel

Expenses

Images

Totals

Summary

----------------------------------------

## Database Tables

Trips

Trip Crew

Trip Boxes

Trip Deliveries

Trip Delivery Boxes

Trip Delivery Per Box

Trip Diesel Entries

Trip Media

Fuel Expenses

Everything must reference ONE Trip ID.

Never create duplicate Trips.

----------------------------------------

## Future Mobile App

Design code for future synchronization.

Same backend.

Same APIs.

Same Draft.

Same Trip ID.

Offline support can be added later.

----------------------------------------

## Testing

Support:

Create Draft

Resume Draft

Autosave

Refresh

Edit

Delete

Submit

Pending

Completed

Image Upload

Validation

Retry

Network Failure

Backend Synchronization

Everything must work after browser refresh.

----------------------------------------

Always protect existing UI.

Never simplify business logic.

Trip Entry quality is higher priority than development speed.

Think before modifying any Trip Entry code.
